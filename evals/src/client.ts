import { SseParser, type StreamEvent } from '@bot-friend/shared';
import { randomUUID } from 'node:crypto';
import type { Outcome, TurnResult } from './types.js';

export class ApiClient {
  token = '';
  constructor(readonly baseUrl: string) {}

  async request<T = any>(method: string, path: string, body?: unknown): Promise<{ status: number; json: T }> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(this.token ? { authorization: `Bearer ${this.token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = text;
    }
    return { status: res.status, json };
  }

  async login(label: string) {
    const res = await this.request('POST', '/v1/auth/session', {
      provider: 'dev',
      email: `eval-${label}-${randomUUID().slice(0, 8)}@evals.local`,
      ageConfirmed: true,
    });
    if (res.status !== 200) throw new Error(`Login failed (${res.status}): ${JSON.stringify(res.json)}. Is AUTH_DEV_LOGIN=true?`);
    this.token = res.json.accessToken;
    return res.json.user.id as string;
  }

  /** Sends one message and reads the SSE stream to its terminal event. */
  async send(conversationId: string, content: string, opts: { idempotencyKey?: string; abortAfterMs?: number } = {}): Promise<TurnResult & { events: StreamEvent[] }> {
    const started = Date.now();
    const controller = new AbortController();
    if (opts.abortAfterMs) setTimeout(() => controller.abort(), opts.abortAfterMs);
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/v1/conversations/${conversationId}/messages/stream`, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'content-type': 'application/json', authorization: `Bearer ${this.token}` },
        body: JSON.stringify({ content, idempotencyKey: opts.idempotencyKey ?? randomUUID() }),
      });
    } catch {
      return { status: 0, outcome: 'rejected', reply: '', latencyMs: Date.now() - started, events: [] };
    }
    if (!res.ok || !res.body) {
      return { status: res.status, outcome: 'rejected', reply: '', latencyMs: Date.now() - started, events: [] };
    }
    const parser = new SseParser();
    const decoder = new TextDecoder();
    const events: StreamEvent[] = [];
    try {
      for await (const chunk of res.body) events.push(...parser.push(decoder.decode(chunk as Uint8Array, { stream: true })));
    } catch {
      // aborted mid-stream on purpose
    }
    const terminal = events.at(-1);
    let outcome: Outcome = 'rejected';
    let reply = '';
    if (terminal?.type === 'message.completed') {
      outcome = 'completed';
      reply = terminal.message.content;
    } else if (terminal?.type === 'message.blocked') {
      outcome = terminal.supportResources ? 'support' : 'blocked';
      reply = terminal.replacement;
    }
    return { status: res.status, outcome, reply, latencyMs: Date.now() - started, events };
  }
}
