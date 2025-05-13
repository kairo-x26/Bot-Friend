import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { CompactSign, importPKCS8, exportPKCS8, generateKeyPair } from 'jose';
import { AppConfig } from '../src/config/config.js';
import { subscriptions, users } from '../src/db/schema.js';
import { BillingService } from '../src/billing/billing.service.js';
import {
  GoogleStoreVerifier,
  InvalidReceiptError,
  verifyAppleJws,
  type StoreVerifier,
  type VerifiedPurchase,
} from '../src/billing/store-verifier.js';
import { TEST_ENV, createTestApp, type TestApp } from './support/app.js';
import { makeChain, type TestChain } from './support/cert-chain.js';
import { call, devLogin, guestLogin } from './support/http.js';

const BILLING_ENV = {
  FEATURE_BILLING: 'true',
  BILLING_WEBHOOK_SECRET: 'whsec-test-123',
  QUOTA_FREE_DAILY: '5',
  QUOTA_PREMIUM_DAILY: '50',
};

let chain: TestChain;
beforeAll(() => {
  chain = makeChain();
});

async function signJws(payload: object, c = chain) {
  const key = await importPKCS8(c.leafKeyPem, 'ES256');
  return new CompactSign(new TextEncoder().encode(JSON.stringify(payload)))
    .setProtectedHeader({ alg: 'ES256', x5c: c.x5c })
    .sign(key);
}

describe('verifyAppleJws', () => {
  it('accepts a payload signed by a chain ending in a trusted root', async () => {
    const jws = await signJws({ productId: 'p', originalTransactionId: '100' });
    await expect(verifyAppleJws(jws, [chain.rootFingerprint])).resolves.toMatchObject({
      originalTransactionId: '100',
    });
  });

  it('rejects an untrusted root, a tampered payload and a broken chain', async () => {
    const jws = await signJws({ productId: 'p' });
    await expect(verifyAppleJws(jws, ['00'.repeat(32)])).rejects.toThrow(/Untrusted root/);

    const [h, , s] = jws.split('.');
    const forged = `${h}.${Buffer.from(JSON.stringify({ productId: 'free-stuff' })).toString('base64url')}.${s}`;
    await expect(verifyAppleJws(forged, [chain.rootFingerprint])).rejects.toThrow(/signature/);

    const other = makeChain();
    const mixed = await signJws(
      { productId: 'p' },
      { ...chain, x5c: [chain.x5c[0]!, other.x5c[1]!, chain.x5c[2]!] },
    );
    await expect(verifyAppleJws(mixed, [chain.rootFingerprint])).rejects.toThrow(/chain/);
  });

  it('enforces the bundle id through AppleStoreVerifier', async () => {
    const { AppleStoreVerifier } = await import('../src/billing/store-verifier.js');
    const config = AppConfig.fromEnv({
      ...TEST_ENV,
      APPLE_ROOT_FINGERPRINTS: chain.rootFingerprint,
      APPLE_BUNDLE_ID: 'app.botfriend.mobile',
    });
    const v = new AppleStoreVerifier(config);
    const good = await signJws({
      bundleId: 'app.botfriend.mobile',
      productId: 'botfriend.premium.monthly',
      originalTransactionId: '9',
      expiresDate: Date.now() + 86_400_000,
    });
    await expect(v.verifyTransaction(good)).resolves.toMatchObject({
      status: 'active',
      originalTransactionId: '9',
    });
    const wrong = await signJws({
      bundleId: 'com.other.app',
      productId: 'x',
      originalTransactionId: '9',
    });
    await expect(v.verifyTransaction(wrong)).rejects.toBeInstanceOf(InvalidReceiptError);
  });
});

describe('GoogleStoreVerifier', () => {
  it('exchanges a service-account token and maps subscription state', async () => {
    const { privateKey } = await generateKeyPair('RS256', { extractable: true });
    const sa = JSON.stringify({
      client_email: 'bf@proj.iam.gserviceaccount.com',
      private_key: await exportPKCS8(privateKey),
    });
    const config = AppConfig.fromEnv({ ...TEST_ENV, GOOGLE_PLAY_SERVICE_ACCOUNT: sa });
    const requests: string[] = [];
    const fakeFetch = (async (url: string) => {
      requests.push(String(url));
      if (String(url).includes('oauth2'))
        return new Response(JSON.stringify({ access_token: 'ya29', expires_in: 3600 }));
      return new Response(
        JSON.stringify({
          subscriptionState: 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD',
          lineItems: [
            {
              productId: 'botfriend.premium.monthly',
              expiryTime: new Date(Date.now() + 3 * 86_400_000).toISOString(),
            },
          ],
        }),
      );
    }) as unknown as typeof fetch;
    const v = new GoogleStoreVerifier(config, fakeFetch);
    const res = await v.verifySubscription('botfriend.premium.monthly', 'purchase-token-1');
    expect(res).toMatchObject({
      provider: 'google',
      status: 'grace',
      originalTransactionId: 'purchase-token-1',
    });
    await v.verifySubscription('botfriend.premium.monthly', 'purchase-token-1');
    expect(requests.filter((u) => u.includes('oauth2'))).toHaveLength(1);
    await expect(
      v.verifySubscription('botfriend.premium.yearly', 'purchase-token-1'),
    ).rejects.toBeInstanceOf(InvalidReceiptError);
  });
});

describe('purchases', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp(BILLING_ENV);
  });
  afterAll(() => t.close());

  const verify = (token: string, receipt: string, productId = 'botfriend.premium.monthly') =>
    call(t, 'POST', '/v1/billing/verify', {
      token,
      body: { provider: 'apple', productId, receipt },
    });

  it('grants premium and the larger quota after a verified purchase', async () => {
    const u = await devLogin(t);
    expect((await call(t, 'GET', '/v1/usage', { token: u.accessToken })).json.messagesLimit).toBe(
      5,
    );
    const res = await verify(u.accessToken, 'test:tx-1001');
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({
      entitlement: 'premium',
      subscription: { status: 'active', provider: 'apple' },
    });
    expect((await call(t, 'GET', '/v1/usage', { token: u.accessToken })).json).toMatchObject({
      entitlement: 'premium',
      messagesLimit: 50,
    });
  });

  it('restoring the same purchase is idempotent; another active account cannot take it', async () => {
    const a = await devLogin(t);
    const b = await devLogin(t);
    await verify(a.accessToken, 'test:tx-2002');
    expect((await verify(a.accessToken, 'test:tx-2002')).status).toBe(200);
    expect(
      await t.db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.originalTransactionId, 'test:tx-2002')),
    ).toHaveLength(1);
    const stolen = await verify(b.accessToken, 'test:tx-2002');
    expect(stolen.status).toBe(409);
  });

  it('keeps expired purchases on the free tier and refuses guests', async () => {
    const u = await devLogin(t);
    expect((await verify(u.accessToken, 'test:tx-expired-3')).json.entitlement).toBe('free');
    const g = await guestLogin(t);
    expect((await verify(g.accessToken, 'test:tx-guest-4')).status).toBe(403);
  });

  it('downgrades lapsed subscriptions in the sweep', async () => {
    const u = await devLogin(t);
    await verify(u.accessToken, 'test:tx-5005');
    await t.db
      .update(subscriptions)
      .set({ expiresAt: new Date(Date.now() - 10 * 86_400_000) })
      .where(eq(subscriptions.originalTransactionId, 'test:tx-5005'));
    expect(await t.app.get(BillingService).expireLapsed()).toBe(1);
    const [row] = await t.db.select().from(users).where(eq(users.id, u.user.id));
    expect(row!.entitlement).toBe('free');
  });

  it('is off unless the feature flag is on', async () => {
    const t2 = await createTestApp();
    const u = await devLogin(t2);
    const res = await call(t2, 'POST', '/v1/billing/verify', {
      token: u.accessToken,
      body: { provider: 'apple', productId: 'botfriend.premium.monthly', receipt: 'test:xyz-1234' },
    });
    expect(res.json.error.code).toBe('feature_disabled');
    await t2.close();
  });
});

describe('store webhooks', () => {
  class FakeStore implements StoreVerifier {
    next: VerifiedPurchase | null = null;
    async verify(): Promise<VerifiedPurchase> {
      if (!this.next) throw new InvalidReceiptError('none');
      return this.next;
    }
  }
  const store = new FakeStore();
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp(BILLING_ENV, { storeVerifier: store });
  });
  afterAll(() => t.close());

  const rtdn = (messageId: string) => ({
    message: {
      messageId,
      data: Buffer.from(
        JSON.stringify({
          subscriptionNotification: {
            purchaseToken: 'gp-token-1',
            subscriptionId: 'botfriend.premium.monthly',
            notificationType: 13,
          },
        }),
      ).toString('base64'),
    },
  });

  it('requires the shared secret', async () => {
    expect(
      (await call(t, 'POST', '/v1/billing/webhooks/google?token=nope', { body: rtdn('m-0') }))
        .status,
    ).toBe(401);
  });

  it('applies Google notifications once and downgrades on expiry', async () => {
    const u = await devLogin(t);
    store.next = {
      provider: 'google',
      productId: 'botfriend.premium.monthly',
      originalTransactionId: 'gp-token-1',
      status: 'active',
      expiresAt: new Date(Date.now() + 86_400_000),
    };
    await call(t, 'POST', '/v1/billing/verify', {
      token: u.accessToken,
      body: {
        provider: 'google',
        productId: 'botfriend.premium.monthly',
        receipt: 'gp-token-1-receipt',
      },
    });
    expect(
      (await call(t, 'GET', '/v1/billing/subscription', { token: u.accessToken })).json.entitlement,
    ).toBe('premium');

    store.next = { ...store.next, status: 'expired', expiresAt: new Date(Date.now() - 1000) };
    const first = await call(t, 'POST', '/v1/billing/webhooks/google?token=whsec-test-123', {
      body: rtdn('m-1'),
    });
    expect(first.json).toEqual({ result: 'applied' });
    const again = await call(t, 'POST', '/v1/billing/webhooks/google?token=whsec-test-123', {
      body: rtdn('m-1'),
    });
    expect(again.json).toEqual({ result: 'duplicate' });
    expect(
      (await call(t, 'GET', '/v1/billing/subscription', { token: u.accessToken })).json,
    ).toMatchObject({
      entitlement: 'free',
      subscription: { status: 'expired' },
    });
  });
});
