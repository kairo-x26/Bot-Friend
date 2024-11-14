import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { usageCounters, usageRecords } from '../src/db/schema.js';
import { MemoryRateLimitStore, RateLimiter, type RateLimitStore } from '../src/limits/rate-limiter.js';
import { createTestApp, type TestApp } from './support/app.js';
import { call, devLogin, guestLogin, newConversation, streamMessage } from './support/http.js';

describe('daily quota', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp({ QUOTA_GUEST_DAILY: '3', QUOTA_FREE_DAILY: '5' });
  });
  afterAll(() => t.close());

  it('stops guests at their trial allowance with a sign-in hint', async () => {
    const g = await guestLogin(t);
    const convo = await newConversation(t, g.accessToken);
    for (let i = 0; i < 3; i++) {
      expect((await streamMessage(t, g.accessToken, convo.id, `msg ${i}`)).status).toBe(200);
    }
    const res = await streamMessage(t, g.accessToken, convo.id, 'one more');
    expect(res.status).toBe(429);
    expect(res.json.error.code).toBe('quota_exceeded');
    expect(res.json.error.message).toMatch(/Sign in/);
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);

    const usage = await call(t, 'GET', '/v1/usage', { token: g.accessToken });
    expect(usage.json).toMatchObject({ entitlement: 'guest', messagesUsed: 3, messagesLimit: 3, period: 'day' });
  });

  it('does not charge replays or retries', async () => {
    const u = await devLogin(t);
    const convo = await newConversation(t, u.accessToken);
    await streamMessage(t, u.accessToken, convo.id, 'hi', { idempotencyKey: 'quota-replay-1' });
    await streamMessage(t, u.accessToken, convo.id, 'hi', { idempotencyKey: 'quota-replay-1' });
    await streamMessage(t, u.accessToken, convo.id, 'hi', { idempotencyKey: 'quota-replay-1' });
    const usage = await call(t, 'GET', '/v1/usage', { token: u.accessToken });
    expect(usage.json.messagesUsed).toBe(1);
  });

  it('never exceeds the limit under concurrent submissions', async () => {
    const u = await devLogin(t);
    const convo = await newConversation(t, u.accessToken);
    const results = await Promise.all(
      Array.from({ length: 12 }, (_, i) => streamMessage(t, u.accessToken, convo.id, `burst ${i}`)),
    );
    expect(results.filter((r) => r.status === 200)).toHaveLength(5);
    expect(results.filter((r) => r.status === 429)).toHaveLength(7);
    const [row] = await t.db.select().from(usageCounters).where(eq(usageCounters.userId, u.user.id));
    expect(row!.messages).toBe(5);
  });
});

describe('rate limits', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp({ RATE_LIMIT_MESSAGES_PER_MINUTE: '2', RATE_LIMIT_AUTH_PER_MINUTE: '4' });
  });
  afterAll(() => t.close());

  it('limits message bursts per user', async () => {
    const u = await devLogin(t);
    const convo = await newConversation(t, u.accessToken);
    expect((await streamMessage(t, u.accessToken, convo.id, 'a')).status).toBe(200);
    expect((await streamMessage(t, u.accessToken, convo.id, 'b')).status).toBe(200);
    const res = await streamMessage(t, u.accessToken, convo.id, 'c');
    expect(res.status).toBe(429);
    expect(res.json.error.code).toBe('rate_limited');
  });

  it('limits sign-in attempts per IP', async () => {
    // One of the 4 allowed attempts was already used by devLogin above.
    const statuses: number[] = [];
    for (let i = 0; i < 5; i++) {
      statuses.push((await call(t, 'POST', '/v1/auth/session', { body: { provider: 'guest', ageConfirmed: true } })).status);
    }
    expect(statuses).toEqual([200, 200, 200, 429, 429]);
  });
});

describe('global spend ceiling', () => {
  it('pauses chat once the daily budget is used up', async () => {
    const t = await createTestApp({ AI_DAILY_BUDGET_USD: '0.01' });
    const u = await devLogin(t);
    await t.db.insert(usageRecords).values({ userId: u.user.id, modelId: 'x', estimatedCostMicros: 20_000 });
    const convo = await newConversation(t, u.accessToken);
    const res = await streamMessage(t, u.accessToken, convo.id, 'hi');
    expect(res.status).toBe(503);
    expect(res.json.error.code).toBe('provider_unavailable');
    await t.close();
  });
});

describe('RateLimiter', () => {
  it('resets after the window', async () => {
    const limiter = new RateLimiter(new MemoryRateLimitStore());
    expect((await limiter.hit('k', 1, 50)).allowed).toBe(true);
    expect((await limiter.hit('k', 1, 50)).allowed).toBe(false);
    await new Promise((r) => setTimeout(r, 60));
    expect((await limiter.hit('k', 1, 50)).allowed).toBe(true);
  });

  it('fails open when the store errors', async () => {
    const broken: RateLimitStore = { increment: async () => Promise.reject(new Error('redis down')) };
    expect((await new RateLimiter(broken).hit('k', 1, 1000)).allowed).toBe(true);
  });
});
