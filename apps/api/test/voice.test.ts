import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { RealtimeProvider } from '../src/voice/realtime.provider.js';
import { createTestApp, type TestApp } from './support/app.js';
import { call, devLogin, guestLogin } from './support/http.js';

class SpyRealtime implements RealtimeProvider {
  last: Parameters<RealtimeProvider['createClientSecret']>[0] | null = null;
  async createClientSecret(opts: Parameters<RealtimeProvider['createClientSecret']>[0]) {
    this.last = opts;
    return { value: 'ek_test_secret', expiresAt: new Date(Date.now() + opts.ttlSeconds * 1000) };
  }
}

let t: TestApp;
const spy = new SpyRealtime();
beforeAll(async () => {
  t = await createTestApp({ FEATURE_VOICE: 'true', QUOTA_FREE_DAILY: '2' }, { realtime: spy });
});
afterAll(() => t.close());

describe('POST /v1/voice/session', () => {
  it('returns a short-lived client secret built from the safety + persona layers', async () => {
    const u = await devLogin(t);
    await call(t, 'PATCH', '/v1/me/preferences', { token: u.accessToken, body: { comedyStyle: 'chill' } });
    const res = await call(t, 'POST', '/v1/voice/session', { token: u.accessToken });
    expect(res.status).toBe(201);
    expect(res.json).toMatchObject({ clientSecret: 'ek_test_secret', model: 'gpt-realtime', voice: 'marin' });
    expect(spy.last!.instructions).toMatch(/You are an AI/);
    expect(spy.last!.instructions).toContain('Style: Chill');
    expect(spy.last!.instructions).toContain('Voice mode');
    expect(spy.last!.safetyIdentifier).toBe(u.user.id);
    expect(JSON.stringify(res.json)).not.toMatch(/sk-/);
  });

  it('counts against the daily quota and is not offered to guests', async () => {
    const u = await devLogin(t);
    expect((await call(t, 'POST', '/v1/voice/session', { token: u.accessToken })).status).toBe(201);
    expect((await call(t, 'POST', '/v1/voice/session', { token: u.accessToken })).status).toBe(201);
    expect((await call(t, 'POST', '/v1/voice/session', { token: u.accessToken })).json.error.code).toBe('quota_exceeded');
    const g = await guestLogin(t);
    expect((await call(t, 'POST', '/v1/voice/session', { token: g.accessToken })).status).toBe(403);
  });

  it('is disabled by default', async () => {
    const t2 = await createTestApp();
    const u = await devLogin(t2);
    expect((await call(t2, 'POST', '/v1/voice/session', { token: u.accessToken })).json.error.code).toBe('feature_disabled');
    await t2.close();
  });
});
