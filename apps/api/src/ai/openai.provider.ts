import OpenAI from 'openai';
import type { AppConfig } from '../config/config.js';
import {
  ProviderError,
  type AiProvider,
  type GenerateChunk,
  type GenerateRequest,
  type ModerationCategory,
  type ModerationProvider,
  type ModerationResult,
} from './provider.js';

function client(config: AppConfig): OpenAI {
  return new OpenAI({
    apiKey: config.env.OPENAI_API_KEY,
    baseURL: config.env.OPENAI_BASE_URL,
    timeout: config.env.AI_TIMEOUT_MS,
    // Retries are handled by our own idempotent retry flow, not silently by the SDK mid-stream.
    maxRetries: 1,
  });
}

function wrap(err: unknown): ProviderError {
  if (err instanceof ProviderError) return err;
  if (err instanceof OpenAI.APIError) {
    const retryable = err.status === undefined || err.status === 429 || err.status >= 500;
    return new ProviderError(`OpenAI ${err.status ?? 'network'}: ${err.message}`, retryable);
  }
  return new ProviderError(err instanceof Error ? err.message : 'OpenAI request failed');
}

/** Text generation through the OpenAI Responses API with streaming. */
export class OpenAiProvider implements AiProvider {
  readonly name = 'openai';
  private readonly openai: OpenAI;

  constructor(private readonly config: AppConfig) {
    this.openai = client(config);
  }

  async *generate(req: GenerateRequest, signal: AbortSignal): AsyncIterable<GenerateChunk> {
    let stream;
    try {
      stream = await this.openai.responses.create(
        {
          model: this.config.env.OPENAI_CHAT_MODEL,
          instructions: req.instructions,
          input: req.input.map((m) => ({ role: m.role, content: m.content })),
          max_output_tokens: req.maxOutputTokens,
          // We keep our own history; don't ask the provider to store application state.
          store: false,
          stream: true,
          ...(req.safetyIdentifier ? { safety_identifier: req.safetyIdentifier } : {}),
        },
        { signal },
      );
    } catch (err) {
      throw wrap(err);
    }

    try {
      for await (const event of stream) {
        if (event.type === 'response.output_text.delta') {
          yield { type: 'delta', text: event.delta };
        } else if (event.type === 'response.completed') {
          const usage = event.response.usage;
          yield {
            type: 'done',
            modelId: event.response.model,
            inputTokens: usage?.input_tokens ?? 0,
            outputTokens: usage?.output_tokens ?? 0,
          };
          return;
        } else if (event.type === 'response.failed' || event.type === 'error') {
          throw new ProviderError('OpenAI reported a failed response');
        } else if (event.type === 'response.incomplete') {
          const usage = event.response.usage;
          yield {
            type: 'done',
            modelId: event.response.model,
            inputTokens: usage?.input_tokens ?? 0,
            outputTokens: usage?.output_tokens ?? 0,
          };
          return;
        }
      }
    } catch (err) {
      if (signal.aborted) return;
      throw wrap(err);
    }
    throw new ProviderError('Stream ended without completion');
  }
}

const CATEGORY_MAP: Record<string, ModerationCategory> = {
  'self-harm': 'self_harm',
  'self-harm/intent': 'self_harm',
  'self-harm/instructions': 'self_harm',
  harassment: 'harassment',
  'harassment/threatening': 'harassment',
  hate: 'hate',
  'hate/threatening': 'hate',
  sexual: 'sexual',
  'sexual/minors': 'sexual_minors',
  violence: 'violence',
  'violence/graphic': 'violence',
  illicit: 'illicit',
  'illicit/violent': 'illicit',
};

export class OpenAiModeration implements ModerationProvider {
  readonly name = 'openai-moderation';
  private readonly openai: OpenAI;

  constructor(private readonly config: AppConfig) {
    this.openai = client(config);
  }

  async moderate(text: string, signal?: AbortSignal): Promise<ModerationResult> {
    try {
      const res = await this.openai.moderations.create(
        { model: this.config.env.OPENAI_MODERATION_MODEL, input: text },
        { signal },
      );
      const result = res.results[0];
      if (!result) return { flagged: false, categories: [] };
      const categories = new Set<ModerationCategory>();
      for (const [key, value] of Object.entries(result.categories)) {
        const mapped = CATEGORY_MAP[key];
        if (value && mapped) categories.add(mapped);
      }
      return { flagged: result.flagged, categories: [...categories] };
    } catch (err) {
      throw wrap(err);
    }
  }
}
