import { Logger } from '@nestjs/common';
import { SignJWT, compactVerify, decodeProtectedHeader, importPKCS8, importX509 } from 'jose';
import { X509Certificate, createHash } from 'node:crypto';
import type { AppConfig } from '../config/config.js';

export interface VerifiedPurchase {
  provider: 'apple' | 'google';
  productId: string;
  originalTransactionId: string;
  status: 'active' | 'grace' | 'expired' | 'revoked';
  expiresAt: Date | null;
}

export interface StoreVerifier {
  verify(provider: 'apple' | 'google', productId: string, receipt: string): Promise<VerifiedPurchase>;
}

export const STORE_VERIFIER = Symbol('STORE_VERIFIER');

export class InvalidReceiptError extends Error {}

/** Apple Root CA - G3, the root of every App Store signed transaction chain. */
export const APPLE_ROOT_CA_G3_SHA256 = '63343abfb89a6a03ebb57e9b3f5fa7be7c4f5c756f3017b3a8c488c3653e9179';

function pem(der: string) {
  return `-----BEGIN CERTIFICATE-----\n${der.match(/.{1,64}/g)!.join('\n')}\n-----END CERTIFICATE-----`;
}

/**
 * Verifies a StoreKit 2 JWS (signed transaction or notification payload):
 * the x5c chain must end in a pinned Apple root, each cert must be signed by the
 * next and be currently valid, and the JWS must be signed by the leaf.
 */
export async function verifyAppleJws<T>(jws: string, trustedRoots: string[], now = new Date()): Promise<T> {
  let header;
  try {
    header = decodeProtectedHeader(jws);
  } catch {
    throw new InvalidReceiptError('Malformed JWS');
  }
  const chain = header.x5c;
  if (header.alg !== 'ES256' || !Array.isArray(chain) || chain.length < 2) throw new InvalidReceiptError('Unexpected JWS header');

  const certs = chain.map((c) => new X509Certificate(Buffer.from(c, 'base64')));
  const root = certs.at(-1)!;
  const rootFingerprint = createHash('sha256').update(root.raw).digest('hex');
  if (!trustedRoots.includes(rootFingerprint)) throw new InvalidReceiptError('Untrusted root certificate');
  for (let i = 0; i < certs.length; i++) {
    const cert = certs[i]!;
    const issuer = certs[i + 1] ?? root;
    if (now < new Date(cert.validFrom) || now > new Date(cert.validTo)) throw new InvalidReceiptError('Certificate not valid now');
    if (!cert.verify(issuer.publicKey)) throw new InvalidReceiptError('Broken certificate chain');
  }
  const key = await importX509(pem(chain[0]!), 'ES256');
  try {
    const { payload } = await compactVerify(jws, key);
    return JSON.parse(new TextDecoder().decode(payload)) as T;
  } catch {
    throw new InvalidReceiptError('Bad JWS signature');
  }
}

interface AppleTransaction {
  bundleId: string;
  productId: string;
  originalTransactionId: string;
  expiresDate?: number;
  revocationDate?: number;
}

export class AppleStoreVerifier {
  constructor(private readonly config: AppConfig) {}

  async verifyTransaction(jws: string): Promise<VerifiedPurchase> {
    const roots = this.config.env.APPLE_ROOT_FINGERPRINTS.length
      ? this.config.env.APPLE_ROOT_FINGERPRINTS.map((f) => f.toLowerCase().replace(/:/g, ''))
      : [APPLE_ROOT_CA_G3_SHA256];
    const tx = await verifyAppleJws<AppleTransaction>(jws, roots);
    if (tx.bundleId !== this.config.env.APPLE_BUNDLE_ID) throw new InvalidReceiptError('Wrong bundle id');
    const expiresAt = tx.expiresDate ? new Date(tx.expiresDate) : null;
    const status = tx.revocationDate ? 'revoked' : expiresAt && expiresAt < new Date() ? 'expired' : 'active';
    return { provider: 'apple', productId: tx.productId, originalTransactionId: tx.originalTransactionId, status, expiresAt };
  }
}

interface ServiceAccount {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

/** Google Play Developer API: purchases.subscriptionsv2.get with a service-account token. */
export class GoogleStoreVerifier {
  private token: { value: string; expiresAt: number } | null = null;

  constructor(
    private readonly config: AppConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now() + 60_000) return this.token.value;
    if (!this.config.env.GOOGLE_PLAY_SERVICE_ACCOUNT) throw new InvalidReceiptError('Google Play is not configured');
    const sa = JSON.parse(this.config.env.GOOGLE_PLAY_SERVICE_ACCOUNT) as ServiceAccount;
    const tokenUri = sa.token_uri ?? 'https://oauth2.googleapis.com/token';
    const assertion = await new SignJWT({ scope: 'https://www.googleapis.com/auth/androidpublisher' })
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuer(sa.client_email)
      .setAudience(tokenUri)
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(await importPKCS8(sa.private_key, 'RS256'));
    const res = await this.fetchImpl(tokenUri, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
    });
    if (!res.ok) throw new Error(`Google token exchange failed: ${res.status}`);
    const json = (await res.json()) as { access_token: string; expires_in: number };
    this.token = { value: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
    return json.access_token;
  }

  async verifySubscription(productId: string, purchaseToken: string): Promise<VerifiedPurchase> {
    const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(
      this.config.env.GOOGLE_PLAY_PACKAGE,
    )}/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`;
    const res = await this.fetchImpl(url, { headers: { authorization: `Bearer ${await this.accessToken()}` } });
    if (res.status === 404 || res.status === 400 || res.status === 410) throw new InvalidReceiptError('Unknown purchase token');
    if (!res.ok) throw new Error(`Play API error ${res.status}`);
    const sub = (await res.json()) as {
      subscriptionState: string;
      lineItems?: Array<{ productId: string; expiryTime?: string }>;
      linkedPurchaseToken?: string;
    };
    const line = sub.lineItems?.find((l) => l.productId === productId) ?? sub.lineItems?.[0];
    if (!line || line.productId !== productId) throw new InvalidReceiptError('Product mismatch');
    const status =
      sub.subscriptionState === 'SUBSCRIPTION_STATE_ACTIVE'
        ? 'active'
        : sub.subscriptionState === 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD'
          ? 'grace'
          : sub.subscriptionState === 'SUBSCRIPTION_STATE_CANCELED'
            ? 'active' // cancelled but not yet expired: entitled until expiry
            : sub.subscriptionState === 'SUBSCRIPTION_STATE_REVOKED'
              ? 'revoked'
              : 'expired';
    const expiresAt = line.expiryTime ? new Date(line.expiryTime) : null;
    return {
      provider: 'google',
      productId,
      // The first token in a chain of upgrades identifies the subscription.
      originalTransactionId: sub.linkedPurchaseToken ?? purchaseToken,
      status: status === 'active' && expiresAt && expiresAt < new Date() ? 'expired' : status,
      expiresAt,
    };
  }
}

/** Real store verification, with a "test:" receipt shortcut outside production. */
export class DefaultStoreVerifier implements StoreVerifier {
  private readonly logger = new Logger('StoreVerifier');
  readonly apple: AppleStoreVerifier;
  readonly google: GoogleStoreVerifier;

  constructor(private readonly config: AppConfig) {
    this.apple = new AppleStoreVerifier(config);
    this.google = new GoogleStoreVerifier(config);
  }

  async verify(provider: 'apple' | 'google', productId: string, receipt: string): Promise<VerifiedPurchase> {
    if (!this.config.isProduction && receipt.startsWith('test:')) {
      this.logger.warn('Accepting a test receipt (non-production only)');
      return {
        provider,
        productId,
        originalTransactionId: receipt,
        status: receipt.includes('expired') ? 'expired' : 'active',
        expiresAt: new Date(Date.now() + (receipt.includes('expired') ? -1 : 30) * 86_400_000),
      };
    }
    const result = provider === 'apple' ? await this.apple.verifyTransaction(receipt) : await this.google.verifySubscription(productId, receipt);
    if (result.productId !== productId) throw new InvalidReceiptError('Product mismatch');
    return result;
  }
}
