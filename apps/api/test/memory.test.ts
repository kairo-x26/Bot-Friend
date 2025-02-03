import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MockProvider } from '../src/ai/mock.provider.js';
import type { AiProvider, GenerateRequest } from '../src/ai/provider.js';
import { extractMemorySuggestions } from '../src/memory/extractor.js';
import { createTestApp, type TestApp } from './support/app.js';
import { call, devLogin, newConversation, streamMessage } from './support/http.js';

class Recorder implements AiProvider {
  readonly name = 'recorder';
  last: GenerateRequest | null = null;
  private readonly inner = new MockProvider(0);
  generate(req: GenerateRequest, signal: AbortSignal) {
    this.last = req;
    return this.inner.generate(req, signal);
  }
}

let t: TestApp;
const recorder = new Recorder();
beforeAll(async () => {
  t = await createTestApp({}, { aiProvider: recorder });
});
afterAll(() => t.close());

async function user() {
  const s = await devLogin(t);
  return s.accessToken;
}
const waitFor = async <T>(fn: () => Promise<T>, ok: (v: T) => boolean) => {
  for (let i = 0; i < 40; i++) {
    const v = await fn();
    if (ok(v)) return v;
    await new Promise((r) => setTimeout(r, 25));
  }
  return fn();
};

describe('memories', () => {
  it('suggests memories only when memory is switched on, and never uses unapproved ones', async () => {
    const token = await user();
    const convo = await newConversation(t, token);
    await streamMessage(t, token, convo.id, 'my name is Priya and I have a dog named Biscuit');
    expect((await call(t, 'GET', '/v1/memories', { token })).json).toEqual({ enabled: false, items: [] });

    await call(t, 'PATCH', '/v1/me/preferences', { token, body: { memoryEnabled: true } });
    await streamMessage(t, token, convo.id, 'my name is Priya and I have a dog named Biscuit');
    const list = await waitFor(
      () => call(t, 'GET', '/v1/memories', { token }),
      (r) => r.json.items.length > 0,
    );
    expect(list.json.items.map((m: any) => [m.content, m.status])).toEqual([
      ['Their name is Priya', 'suggested'],
      ['Has a dog named Biscuit', 'suggested'],
    ]);

    await streamMessage(t, token, convo.id, 'what do you know about me?');
    expect(recorder.last!.instructions).not.toContain('Priya');
  });

  it('uses approved and user-written memories in prompts, and drops them once deleted', async () => {
    const token = await user();
    await call(t, 'PATCH', '/v1/me/preferences', { token, body: { memoryEnabled: true } });
    const created = await call(t, 'POST', '/v1/memories', { token, body: { content: 'Loves terrible puns' } });
    expect(created.json.status).toBe('approved');

    const convo = await newConversation(t, token);
    await streamMessage(t, token, convo.id, 'joke please');
    expect(recorder.last!.instructions).toContain('- Loves terrible puns');

    await call(t, 'DELETE', `/v1/memories/${created.json.id}`, { token });
    await streamMessage(t, token, convo.id, 'another joke');
    expect(recorder.last!.instructions).not.toContain('Loves terrible puns');
  });

  it('approving or editing a suggestion makes it usable', async () => {
    const token = await user();
    await call(t, 'PATCH', '/v1/me/preferences', { token, body: { memoryEnabled: true } });
    const convo = await newConversation(t, token);
    await streamMessage(t, token, convo.id, 'my favorite snack is spicy pickles');
    const list = await waitFor(() => call(t, 'GET', '/v1/memories', { token }), (r) => r.json.items.length > 0);
    const id = list.json.items[0].id;
    const edited = await call(t, 'PATCH', `/v1/memories/${id}`, { token, body: { content: 'Favorite snack: pickles (spicy!)' } });
    expect(edited.json).toMatchObject({ status: 'approved', content: 'Favorite snack: pickles (spicy!)' });
    await streamMessage(t, token, convo.id, 'hello');
    expect(recorder.last!.instructions).toContain('Favorite snack: pickles (spicy!)');
  });

  it('turning memory off stops using memories without deleting them', async () => {
    const token = await user();
    await call(t, 'PATCH', '/v1/me/preferences', { token, body: { memoryEnabled: true } });
    await call(t, 'POST', '/v1/memories', { token, body: { content: 'Plays bass guitar' } });
    await call(t, 'PATCH', '/v1/me/preferences', { token, body: { memoryEnabled: false } });
    const convo = await newConversation(t, token);
    await streamMessage(t, token, convo.id, 'hi');
    expect(recorder.last!.instructions).not.toContain('bass guitar');
    expect((await call(t, 'GET', '/v1/memories', { token })).json.items).toHaveLength(1);
  });

  it('erases everything on request', async () => {
    const token = await user();
    await call(t, 'POST', '/v1/memories', { token, body: { content: 'One' } });
    await call(t, 'POST', '/v1/memories', { token, body: { content: 'Two' } });
    expect((await call(t, 'DELETE', '/v1/memories', { token })).json).toEqual({ deleted: 2 });
    expect((await call(t, 'GET', '/v1/memories', { token })).json.items).toEqual([]);
  });

  it('keeps memories private to their owner', async () => {
    const a = await user();
    const b = await user();
    const m = await call(t, 'POST', '/v1/memories', { token: a, body: { content: 'Secret hobby: competitive napping' } });
    expect((await call(t, 'PATCH', `/v1/memories/${m.json.id}`, { token: b, body: { status: 'approved' } })).status).toBe(404);
    expect((await call(t, 'DELETE', `/v1/memories/${m.json.id}`, { token: b })).status).toBe(404);
    expect((await call(t, 'GET', '/v1/memories', { token: b })).json.items).toEqual([]);
  });

  it('is unavailable when the feature flag is off', async () => {
    const t2 = await createTestApp({ FEATURE_MEMORY: 'false' });
    const s = await devLogin(t2);
    expect((await call(t2, 'GET', '/v1/memories', { token: s.accessToken })).json.error.code).toBe('feature_disabled');
    await t2.close();
  });
});

describe('extractMemorySuggestions', () => {
  it.each([
    ['my name is Sam', ['Their name is Sam']],
    ['I have a cat named Miso!', ['Has a cat named Miso']],
    ['I really love bouldering.', ['Enjoys bouldering']],
    ['I hate pun jokes', ['Doesn’t like pun jokes']],
    ['my email is sam@example.com and my name is Sam', []],
    ['I love my therapy sessions', []],
    ['what is the weather', []],
  ])('%s', (text, expected) => {
    expect(extractMemorySuggestions(text)).toEqual(expected);
  });
});
