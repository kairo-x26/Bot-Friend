import OpenAI from 'openai';
import type { AppConfig } from '../config/config.js';
import { ProviderError } from '../ai/provider.js';

export interface RealtimeSecret {
  value: string;
  expiresAt: Date;
}

export interface RealtimeProvider {
  createClientSecret(opts: { instructions: string; model: string; voice: string; ttlSeconds: number; safetyIdentifier: string }): Promise<RealtimeSecret>;
}

export const REALTIME_PROVIDER = Symbol('REALTIME_PROVIDER');

/**
 * Mints a short-lived client secret so the app can open a WebRTC session with
 * the OpenAI Realtime API directly. The standard API key never leaves the server.
 */
export class OpenAiRealtimeProvider implements RealtimeProvider {
  private readonly openai: OpenAI;

  constructor(config: AppConfig) {
    this.openai = new OpenAI({ apiKey: config.env.OPENAI_API_KEY, baseURL: config.env.OPENAI_BASE_URL, timeout: 10_000 });
  }

  async createClientSecret({ instructions, model, voice, ttlSeconds, safetyIdentifier }: Parameters<RealtimeProvider['createClientSecret']>[0]) {
    try {
      const res = await this.openai.realtime.clientSecrets.create(
        {
          expires_after: { anchor: 'created_at', seconds: ttlSeconds },
          session: {
            type: 'realtime',
            model,
            instructions,
            max_output_tokens: 600,
            audio: { output: { voice } },
          },
        },
        { headers: { 'OpenAI-Safety-Identifier': safetyIdentifier } },
      );
      return { value: res.value, expiresAt: new Date(res.expires_at * 1000) };
    } catch (err) {
      throw new ProviderError(`Realtime secret failed: ${(err as Error).message}`);
    }
  }
}

/** Offline stand-in: returns a fake secret so the voice UI can be built and tested. */
export class MockRealtimeProvider implements RealtimeProvider {
  async createClientSecret({ ttlSeconds }: { ttlSeconds: number }) {
    return { value: `ek_mock_${Math.random().toString(36).slice(2)}`, expiresAt: new Date(Date.now() + ttlSeconds * 1000) };
  }
}
