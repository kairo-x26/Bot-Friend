import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import { ErrorCode } from '@bot-friend/shared';
import { ApiError } from '../common/api-error.js';
import type { AppConfig } from '../config/config.js';

export interface VerifiedIdentity {
  subject: string;
  name: string | null;
}

export interface IdTokenVerifier {
  verify(provider: 'apple' | 'google', idToken: string): Promise<VerifiedIdentity>;
}

export const ID_TOKEN_VERIFIER = Symbol('ID_TOKEN_VERIFIER');

const PROVIDERS = {
  apple: { jwks: 'https://appleid.apple.com/auth/keys', issuers: ['https://appleid.apple.com'] },
  google: {
    jwks: 'https://www.googleapis.com/oauth2/v3/certs',
    issuers: ['https://accounts.google.com', 'accounts.google.com'],
  },
} as const;

/** Verifies Apple / Google OpenID Connect ID tokens against the provider's published keys. */
export class OidcIdTokenVerifier implements IdTokenVerifier {
  private readonly keySets = new Map<string, JWTVerifyGetKey>();

  constructor(
    private readonly config: AppConfig,
    private readonly keySetFor: (url: string) => JWTVerifyGetKey = (url) => createRemoteJWKSet(new URL(url)),
  ) {}

  async verify(provider: 'apple' | 'google', idToken: string): Promise<VerifiedIdentity> {
    const audience = provider === 'apple' ? this.config.env.APPLE_CLIENT_IDS : this.config.env.GOOGLE_CLIENT_IDS;
    if (audience.length === 0) {
      throw new ApiError(ErrorCode.FeatureDisabled, `${provider} sign-in is not configured`);
    }
    const meta = PROVIDERS[provider];
    let keys = this.keySets.get(provider);
    if (!keys) {
      keys = this.keySetFor(meta.jwks);
      this.keySets.set(provider, keys);
    }
    try {
      const { payload } = await jwtVerify(idToken, keys, {
        issuer: [...meta.issuers],
        audience,
        clockTolerance: 30,
      });
      if (!payload.sub) throw new Error('missing sub');
      const name = typeof payload['name'] === 'string' ? payload['name'] : null;
      return { subject: payload.sub, name };
    } catch {
      throw ApiError.unauthenticated('Sign-in could not be verified. Try again.');
    }
  }
}
