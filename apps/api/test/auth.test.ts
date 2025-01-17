import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from 'jose';
import { OidcIdTokenVerifier } from '../src/auth/id-token-verifier.js';
import { AppConfig } from '../src/config/config.js';
import { users } from '../src/db/schema.js';
import { TEST_ENV, createTestApp, type TestApp } from './support/app.js';
import { call, devLogin, guestLogin } from './support/http.js';

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(() => t.close());

describe('POST /v1/auth/session', () => {
  it('blocks users who do not confirm they are adults, without creating an account', async () => {
    const before = await t.db.select().from(users);
    const res = await call(t, 'POST', '/v1/auth/session', { body: { provider: 'guest', ageConfirmed: false } });
    expect(res.status).toBe(403);
    expect(res.json.error.code).toBe('age_ineligible');
    expect(await t.db.select().from(users)).toHaveLength(before.length);
  });

  it('validates the request body', async () => {
    const res = await call(t, 'POST', '/v1/auth/session', { body: { provider: 'myspace' } });
    expect(res.status).toBe(400);
    expect(res.json.error.code).toBe('validation_failed');
  });

  it('creates a guest trial and resumes it with the guest token', async () => {
    const first = await guestLogin(t);
    expect(first.user.isGuest).toBe(true);
    expect(first.guestToken).toBeTruthy();
    const again = await guestLogin(t, first.guestToken);
    expect(again.user.id).toBe(first.user.id);
    const fresh = await guestLogin(t, 'x'.repeat(40));
    expect(fresh.user.id).not.toBe(first.user.id);
  });

  it('returns the same account for repeat dev logins (case-insensitive email)', async () => {
    const a = await devLogin(t, 'Same@Example.com');
    const b = await devLogin(t, 'same@example.com');
    expect(a.user.id).toBe(b.user.id);
    expect(a.user.isGuest).toBe(false);
  });

  it('moves guest conversations to the account on upgrade', async () => {
    const guest = await guestLogin(t);
    await call(t, 'PATCH', '/v1/me/preferences', { token: guest.accessToken, body: { comedyStyle: 'chaotic' } });
    const res = await call(t, 'POST', '/v1/auth/session', {
      body: { provider: 'dev', email: 'upgrader@example.com', ageConfirmed: true, upgradeGuestToken: guest.guestToken },
    });
    expect(res.status).toBe(200);
    const me = await call(t, 'GET', '/v1/me', { token: res.json.accessToken });
    expect(me.json.preferences.comedyStyle).toBe('chaotic');
    // guest row is gone, so its token no longer works
    const old = await call(t, 'GET', '/v1/me', { token: guest.accessToken });
    expect(old.status).toBe(401);
  });

  it('bootstraps admins from DEV_ADMIN_EMAILS for local testing', async () => {
    const t2 = await createTestApp({ DEV_ADMIN_EMAILS: 'Boss@Example.com' });
    const boss = await devLogin(t2, 'boss@example.com');
    const other = await devLogin(t2, 'worker@example.com');
    expect(boss.user.role).toBe('admin');
    expect(other.user.role).toBe('user');
    await t2.close();
  });

  it('rejects dev login when disabled', async () => {
    const t2 = await createTestApp({ AUTH_DEV_LOGIN: 'false' });
    const res = await call(t2, 'POST', '/v1/auth/session', {
      body: { provider: 'dev', email: 'a@b.co', ageConfirmed: true },
    });
    expect(res.status).toBe(404);
    expect(res.json.error.code).toBe('feature_disabled');
    await t2.close();
  });
});

describe('apple / google sign-in', () => {
  it('creates one account per provider subject', async () => {
    const t2 = await createTestApp(
      {},
      {
        idTokenVerifier: {
          verify: async (_provider, idToken) => {
            if (idToken === 'bad-token-value') throw new Error('nope');
            return { subject: `sub-${idToken}`, name: 'Sam' };
          },
        },
      },
    );
    const login = (idToken: string) =>
      call(t2, 'POST', '/v1/auth/session', { body: { provider: 'apple', idToken, ageConfirmed: true } });
    const a = await login('token-aaaaaa');
    const b = await login('token-aaaaaa');
    expect(a.status).toBe(200);
    expect(a.json.user).toMatchObject({ provider: 'apple', displayName: 'Sam', isGuest: false });
    expect(b.json.user.id).toBe(a.json.user.id);
    expect((await login('bad-token-value')).status).toBeGreaterThanOrEqual(400);
    await t2.close();
  });
});

describe('session guard', () => {
  it('requires a bearer token', async () => {
    expect((await call(t, 'GET', '/v1/me')).status).toBe(401);
    expect((await call(t, 'GET', '/v1/me', { token: 'garbage' })).status).toBe(401);
  });

  it('revokes tokens when the session version changes', async () => {
    const s = await devLogin(t);
    expect((await call(t, 'GET', '/v1/me', { token: s.accessToken })).status).toBe(200);
    const [row] = await t.db.select().from(users).where(eq(users.id, s.user.id));
    await t.db.update(users).set({ sessionVersion: row!.sessionVersion + 1 }).where(eq(users.id, s.user.id));
    expect((await call(t, 'GET', '/v1/me', { token: s.accessToken })).status).toBe(401);
  });

  it('blocks suspended accounts', async () => {
    const s = await devLogin(t);
    await t.db.update(users).set({ status: 'suspended' }).where(eq(users.id, s.user.id));
    const res = await call(t, 'GET', '/v1/me', { token: s.accessToken });
    expect(res.status).toBe(403);
  });
});

describe('/v1/me', () => {
  it('returns the user with default preferences', async () => {
    const s = await devLogin(t);
    const res = await call(t, 'GET', '/v1/me', { token: s.accessToken });
    expect(res.status).toBe(200);
    expect(res.json.user.id).toBe(s.user.id);
    expect(res.json.preferences).toMatchObject({ comedyStyle: 'wholesome', roastOptIn: false, theme: 'system' });
  });

  it('patches preferences and dedupes boundaries', async () => {
    const s = await devLogin(t);
    const res = await call(t, 'PATCH', '/v1/me/preferences', {
      token: s.accessToken,
      body: { comedyStyle: 'sarcastic', humorBoundaries: ['family', 'family', 'work'], theme: 'dark' },
    });
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({ comedyStyle: 'sarcastic', theme: 'dark' });
    expect(res.json.humorBoundaries).toEqual(['family', 'work']);
  });

  it('rejects unknown values', async () => {
    const s = await devLogin(t);
    const res = await call(t, 'PATCH', '/v1/me/preferences', { token: s.accessToken, body: { comedyStyle: 'cruel' } });
    expect(res.status).toBe(400);
  });
});

describe('OidcIdTokenVerifier', () => {
  it('accepts a correctly signed token for a configured audience and rejects others', async () => {
    const { publicKey, privateKey } = await generateKeyPair('RS256');
    const jwk = { ...(await exportJWK(publicKey)), kid: 'k1', alg: 'RS256' };
    const keySet = createLocalJWKSet({ keys: [jwk] });
    const config = AppConfig.fromEnv({ ...TEST_ENV, GOOGLE_CLIENT_IDS: 'my-client' });
    const verifier = new OidcIdTokenVerifier(config, () => keySet);

    const sign = (aud: string, iss = 'https://accounts.google.com') =>
      new SignJWT({ name: 'Ada' })
        .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
        .setSubject('google-sub-1')
        .setIssuer(iss)
        .setAudience(aud)
        .setIssuedAt()
        .setExpirationTime('5m')
        .sign(privateKey);

    await expect(verifier.verify('google', await sign('my-client'))).resolves.toEqual({
      subject: 'google-sub-1',
      name: 'Ada',
    });
    await expect(verifier.verify('google', await sign('someone-else'))).rejects.toThrow(/could not be verified/);
    await expect(verifier.verify('google', await sign('my-client', 'https://evil.example'))).rejects.toThrow();
    await expect(verifier.verify('apple', await sign('my-client'))).rejects.toThrow(/not configured/);
  });
});
