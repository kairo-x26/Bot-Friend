export interface PromptMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface GenerateRequest {
  /** System-level instructions (all non-user layers, already ordered by priority). */
  instructions: string;
  /** Conversation turns, oldest first, ending with the current user message. */
  input: PromptMessage[];
  maxOutputTokens: number;
  /** Opaque per-user identifier for provider abuse monitoring; never an email. */
  safetyIdentifier?: string;
}

export type GenerateChunk =
  | { type: 'delta'; text: string }
  | { type: 'done'; modelId: string; inputTokens: number; outputTokens: number };

export interface AiProvider {
  readonly name: string;
  generate(req: GenerateRequest, signal: AbortSignal): AsyncIterable<GenerateChunk>;
}

export type ModerationCategory =
  | 'self_harm'
  | 'harassment'
  | 'hate'
  | 'sexual'
  | 'sexual_minors'
  | 'violence'
  | 'illicit';

export interface ModerationResult {
  flagged: boolean;
  categories: ModerationCategory[];
}

export interface ModerationProvider {
  readonly name: string;
  moderate(text: string, signal?: AbortSignal): Promise<ModerationResult>;
}

export const AI_PROVIDER = Symbol('AI_PROVIDER');
export const MODERATION_PROVIDER = Symbol('MODERATION_PROVIDER');

/** Upstream failure that is safe to surface as `provider_unavailable`. */
export class ProviderError extends Error {
  constructor(
    message: string,
    readonly retryable = true,
  ) {
    super(message);
  }
}
