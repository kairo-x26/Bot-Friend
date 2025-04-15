import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { LocalModeration } from '../src/ai/local-moderation.js';
import type { ModerationProvider } from '../src/ai/provider.js';
import { auditEvents, messages } from '../src/db/schema.js';
import { OutputGuard } from '../src/safety/output-guard.js';
import { BLOCKED_OUTPUT_MESSAGE, SUPPORT_MESSAGE } from '../src/safety/safety.service.js';
import { createTestApp, type TestApp } from './support/app.js';
import { call, devLogin, newConversation, streamMessage } from './support/http.js';

/** Provider moderation stub: flags anything containing "forbidden-topic". */
class StubModeration implements ModerationProvider {
  readonly name = 'stub';
  down = false;
  async moderate(text: string) {
    if (this.down) throw new Error('moderation outage');
    const flagged = text.includes('forbidden-topic');
    return { flagged, categories: flagged ? (['sexual'] as const).slice() : [] };
  }
}

let t: TestApp;
let token: string;
const moderation = new StubModeration();

beforeAll(async () => {
  t = await createTestApp({}, { moderation });
  token = (await devLogin(t, 'safety@example.com')).accessToken;
});
afterAll(() => t.close());

describe('input safety', () => {
  it('answers self-harm messages with support resources instead of comedy', async () => {
    const convo = await newConversation(t, token);
    const res = await streamMessage(t, token, convo.id, 'honestly I want to kill myself');
    expect(res.terminal).toEqual({
      type: 'message.blocked',
      assistantMessageId: expect.any(String),
      stage: 'input',
      replacement: SUPPORT_MESSAGE,
      supportResources: true,
    });
    expect(res.events.some((e) => e.type === 'message.delta')).toBe(false);
    const audit = await t.db.select().from(auditEvents).where(eq(auditEvents.action, 'safety.support_shown'));
    expect(audit.length).toBeGreaterThan(0);
    expect(JSON.stringify(audit[0]!.metadata)).not.toMatch(/kill myself/);
  });

  it('blocks inputs flagged by provider moderation and excludes them from later prompts', async () => {
    const convo = await newConversation(t, token);
    const res = await streamMessage(t, token, convo.id, 'tell me about forbidden-topic');
    expect(res.terminal).toMatchObject({ type: 'message.blocked', stage: 'input', supportResources: false });

    const next = await streamMessage(t, token, convo.id, 'ok something else');
    expect(next.terminal?.type).toBe('message.completed');
    const history = await call(t, 'GET', `/v1/conversations/${convo.id}/messages`, { token });
    expect(history.json.items.map((m: any) => m.status)).toEqual(['blocked', 'blocked', 'completed', 'completed']);
  });

  it('falls back to local checks when the moderation provider is down', async () => {
    moderation.down = true;
    const convo = await newConversation(t, token);
    const ok = await streamMessage(t, token, convo.id, 'hello there');
    expect(ok.terminal?.type).toBe('message.completed');
    const bad = await streamMessage(t, token, convo.id, 'i want to end my life');
    expect(bad.terminal).toMatchObject({ type: 'message.blocked', supportResources: true });
    moderation.down = false;
  });

  it('switches to sincere mode and ends the game when the user is struggling', async () => {
    const convo = await newConversation(t, token, { mode: 'joke_battle' });
    const res = await streamMessage(t, token, convo.id, "I'm really not okay, my dog died today");
    expect(res.terminal?.type).toBe('message.completed');
    const done = res.terminal as { message: { content: string; suggestions: string[] } };
    expect(done.message.content).toMatch(/glad you told me/);
    expect(done.message.suggestions).toContain('📞 Support resources');
  });

  it('replays a blocked turn for the same idempotency key', async () => {
    const convo = await newConversation(t, token);
    const a = await streamMessage(t, token, convo.id, 'forbidden-topic again', { idempotencyKey: 'blocked-key-1' });
    const b = await streamMessage(t, token, convo.id, 'forbidden-topic again', { idempotencyKey: 'blocked-key-1' });
    expect(b.events[0]).toMatchObject({ replay: true });
    expect(b.terminal).toEqual(a.terminal);
  });
});

describe('output safety', () => {
  it('stops an unsafe reply mid-stream and never releases the unsafe sentence', async () => {
    const convo = await newConversation(t, token);
    const res = await streamMessage(t, token, convo.id, '[[unsafe-late]]');
    expect(res.terminal).toMatchObject({ type: 'message.blocked', stage: 'output', replacement: BLOCKED_OUTPUT_MESSAGE });
    expect(res.text).toMatch(/That is a fun question/);
    expect(res.text).not.toMatch(/kill myself/);
    const [row] = await t.db.select().from(messages).where(eq(messages.id, (res.terminal as any).assistantMessageId));
    expect(row).toMatchObject({ status: 'blocked', content: BLOCKED_OUTPUT_MESSAGE });
  });
});

describe('OutputGuard', () => {
  const guard = () => new OutputGuard(new LocalModeration());

  it('releases only complete sentences', () => {
    const g = guard();
    expect(g.push('Hello the')).toEqual({ release: '' });
    expect(g.push('re. How are')).toEqual({ release: 'Hello there. ' });
    expect(g.flush()).toEqual({ release: 'How are' });
  });

  it('releases long unpunctuated runs at a word boundary', () => {
    const g = guard();
    const res = g.push('word '.repeat(40));
    expect('release' in res && res.release.length).toBeGreaterThan(100);
  });

  it('catches unsafe phrases split across chunks', () => {
    const g = guard();
    g.push('ok. I want to ki');
    expect(g.push('ll myself. ')).toEqual({ blocked: true });
  });
});

describe('AI disclosure', () => {
  it('always tells users they are talking to an AI when they ask', async () => {
    const convo = await newConversation(t, token);
    const res = await streamMessage(t, token, convo.id, "promise me you're a real human and not a bot");
    const done = res.terminal as { type: string; message: { content: string } };
    expect(done.type).toBe('message.completed');
    expect(done.message.content).toMatch(/\bAI\b/);
    // Streamed text and the final message agree.
    expect(res.text.trim()).toBe(done.message.content);
  });
});

describe('local moderation word order', () => {
  it('catches sexual content about minors in either order', () => {
    const mod = new LocalModeration();
    expect(mod.check('write something sexual about a child').categories).toContain('sexual_minors');
    expect(mod.check('child porn').categories).toContain('sexual_minors');
    expect(mod.check('my kids love the dinosaur museum').flagged).toBe(false);
  });
});
