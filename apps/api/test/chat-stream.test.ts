import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { MockProvider } from '../src/ai/mock.provider.js';
import { ProviderError, type AiProvider, type GenerateRequest } from '../src/ai/provider.js';
import { messages, usageRecords } from '../src/db/schema.js';
import { createTestApp, type TestApp } from './support/app.js';
import { call, devLogin, newConversation, streamMessage } from './support/http.js';

/** Fails the first N calls, then behaves like the mock, and records every request. */
class ScriptedProvider implements AiProvider {
  readonly name = 'scripted';
  failuresLeft = 0;
  requests: GenerateRequest[] = [];
  inner: AiProvider = new MockProvider(0);

  async *generate(req: GenerateRequest, signal: AbortSignal) {
    this.requests.push(req);
    if (this.failuresLeft > 0) {
      this.failuresLeft--;
      throw new ProviderError('scripted outage');
    }
    yield* this.inner.generate(req, signal);
  }
}

let t: TestApp;
let provider: ScriptedProvider;
let token: string;
let userId: string;

beforeAll(async () => {
  provider = new ScriptedProvider();
  t = await createTestApp({}, { aiProvider: provider });
  const s = await devLogin(t, 'streamer@example.com');
  token = s.accessToken;
  userId = s.user.id;
});
afterAll(() => t.close());

describe('POST /v1/conversations/:id/messages/stream', () => {
  it('streams started → deltas → completed and persists both messages', async () => {
    const convo = await newConversation(t, token);
    const res = await streamMessage(t, token, convo.id, 'I have 47 things to do today and zero motivation.');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/event-stream/);
    expect(res.events[0]?.type).toBe('message.started');
    expect(res.terminal?.type).toBe('message.completed');

    const deltas = res.events.filter((e) => e.type === 'message.delta');
    // The output guard releases whole sentences, so deltas are sentence-sized.
    expect(deltas.length).toBeGreaterThan(1);
    expect(deltas.map((d) => (d as { seq: number }).seq)).toEqual(deltas.map((_, i) => i));

    const done = res.terminal as Extract<typeof res.terminal, { type: 'message.completed' }>;
    expect(done.message.content).toBe(res.text.trim());
    expect(done.message.content).toMatch(/to-do list has its own to-do list/);
    expect(done.message.suggestions).toContain('✨ Motivate me');

    const history = await call(t, 'GET', `/v1/conversations/${convo.id}/messages`, { token });
    expect(history.json.items.map((m: any) => [m.role, m.status])).toEqual([
      ['user', 'completed'],
      ['assistant', 'completed'],
    ]);

    const detail = await call(t, 'GET', `/v1/conversations/${convo.id}`, { token });
    expect(detail.json.title).toMatch(/^I have 47 things to do today.*…$/);
    expect(detail.json.title.length).toBeLessThanOrEqual(48);
    expect(detail.json.lastMessagePreview).toMatch(/to-do list/);

    const usage = await t.db.select().from(usageRecords).where(eq(usageRecords.messageId, done.message.id));
    expect(usage).toHaveLength(1);
    expect(usage[0]!.outputTokens).toBeGreaterThan(0);
  });

  it('replays instead of duplicating when the same idempotency key is resent', async () => {
    const convo = await newConversation(t, token);
    const first = await streamMessage(t, token, convo.id, 'hello!', { idempotencyKey: 'key-replay-1' });
    const second = await streamMessage(t, token, convo.id, 'hello!', { idempotencyKey: 'key-replay-1' });

    expect(second.events[0]).toMatchObject({ type: 'message.started', replay: true });
    expect(second.terminal).toEqual(first.terminal);
    const rows = await t.db.select().from(messages).where(eq(messages.conversationId, convo.id));
    expect(rows).toHaveLength(2);
  });

  it('rejects an idempotency key reused for different content', async () => {
    const convo = await newConversation(t, token);
    await streamMessage(t, token, convo.id, 'first', { idempotencyKey: 'key-mismatch-1' });
    const res = await streamMessage(t, token, convo.id, 'second', { idempotencyKey: 'key-mismatch-1' });
    expect(res.status).toBe(409);
    expect(res.json.error.code).toBe('idempotency_mismatch');
  });

  it('keeps the user message on provider failure and retries without duplicates', async () => {
    const convo = await newConversation(t, token);
    provider.failuresLeft = 1;
    const failed = await streamMessage(t, token, convo.id, 'tell me a joke', { idempotencyKey: 'key-retry-1' });
    expect(failed.terminal).toMatchObject({ type: 'message.failed', code: 'provider_unavailable', retryable: true });

    const afterFail = await call(t, 'GET', `/v1/conversations/${convo.id}/messages`, { token });
    expect(afterFail.json.items.map((m: any) => m.status)).toEqual(['completed', 'failed']);

    const retried = await streamMessage(t, token, convo.id, 'tell me a joke', { idempotencyKey: 'key-retry-1' });
    expect(retried.terminal?.type).toBe('message.completed');
    expect(retried.events[0]).toMatchObject({ replay: false });

    const rows = await t.db.select().from(messages).where(eq(messages.conversationId, convo.id));
    expect(rows.filter((r) => r.role === 'user')).toHaveLength(1);
    expect(rows.filter((r) => r.role === 'assistant').map((r) => r.status)).toEqual(['completed']);
  });

  it('cancels a running generation without saving it as completed', async () => {
    const convo = await newConversation(t, token);
    const slowApp = t; // same app; slow output via the [[long]] trigger and a slow provider
    provider.failuresLeft = 0;
    provider.inner = new MockProvider(20);

    const pending = streamMessage(slowApp, token, convo.id, '[[long]] go on', { idempotencyKey: 'key-cancel-1' });
    let assistantId: string | undefined;
    for (let i = 0; i < 100 && !assistantId; i++) {
      await new Promise((r) => setTimeout(r, 20));
      const [row] = await t.db
        .select()
        .from(messages)
        .where(and(eq(messages.conversationId, convo.id), eq(messages.role, 'assistant')));
      assistantId = row?.id;
    }
    expect(assistantId).toBeTruthy();
    await new Promise((r) => setTimeout(r, 80));
    const cancel = await call(t, 'POST', `/v1/conversations/${convo.id}/messages/${assistantId}/cancel`, { token });
    expect(cancel.json).toEqual({ cancelled: true });

    const res = await pending;
    provider.inner = new MockProvider(0);
    expect(res.terminal).toMatchObject({ type: 'message.failed', code: 'cancelled' });
    const [row] = await t.db.select().from(messages).where(eq(messages.id, assistantId!));
    expect(row!.status).toBe('cancelled');
    expect(res.events.some((e) => e.type === 'message.completed')).toBe(false);

    // History used for prompts excludes the cancelled reply.
    provider.requests = [];
    await streamMessage(t, token, convo.id, 'ok new message');
    const prior = provider.requests[0]!.input.map((m) => m.content);
    expect(prior.join(' ')).not.toMatch(/Sentence number/);
  });

  it('does not let another user stream into a conversation', async () => {
    const convo = await newConversation(t, token);
    const other = await devLogin(t, 'intruder@example.com');
    const res = await streamMessage(t, other.accessToken, convo.id, 'hi');
    expect(res.status).toBe(404);
    const cancel = await call(t, 'POST', `/v1/conversations/${convo.id}/messages/${convo.id}/cancel`, {
      token: other.accessToken,
    });
    expect(cancel.status).toBe(404);
  });

  it('validates the message body before opening a stream', async () => {
    const convo = await newConversation(t, token);
    const empty = await streamMessage(t, token, convo.id, '   ');
    expect(empty.status).toBe(400);
    expect(empty.headers['content-type']).toMatch(/json/);
  });

  it('sends prior turns as history and honors a per-reply style override', async () => {
    const convo = await newConversation(t, token);
    await streamMessage(t, token, convo.id, 'my name is Kai');
    provider.requests = [];
    const res = await streamMessage(t, token, convo.id, 'tell me a joke', { comedyStyle: 'chaotic' });
    const req = provider.requests[0]!;
    expect(req.input.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
    expect(req.input[0]!.content).toBe('my name is Kai');
    expect(req.instructions).toContain('Style: Chaotic');
    expect(req.safetyIdentifier).toBe(userId);
    expect(res.terminal?.type).toBe('message.completed');
    const detail = await call(t, 'GET', `/v1/conversations/${convo.id}`, { token });
    expect(detail.json.comedyStyle).toBe('chaotic');
  });

  it('handles unicode and emoji content intact', async () => {
    const convo = await newConversation(t, token);
    const content = 'héllo 👋🏽 — 日本語 ✨ ‍';
    const res = await streamMessage(t, token, convo.id, content);
    expect(res.terminal?.type).toBe('message.completed');
    const started = res.events[0] as { userMessage: { content: string } };
    expect(started.userMessage.content).toBe(content.trim());
  });
});
