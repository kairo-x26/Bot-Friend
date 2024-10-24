import { Injectable } from '@nestjs/common';
import { SignJWT, jwtVerify } from 'jose';
import { createHash, randomBytes } from 'node:crypto';
import type { UserRole } from '@bot-friend/shared';
import { AppConfig } from '../config/config.js';

export interface SessionClaims {
  sub: string;
  sv: number;
  role: UserRole;
}

const ISSUER = 'bot-friend';
const AUDIENCE = 'bot-friend-app';

@Injectable()
export class TokenService {
  private readonly key: Uint8Array;

  constructor(private readonly config: AppConfig) {
    this.key = new TextEncoder().encode(config.env.JWT_SECRET);
  }

  async sign(claims: SessionClaims): Promise<{ token: string; expiresAt: Date }> {
    const expiresAt = new Date(Date.now() + this.config.env.SESSION_TTL_HOURS * 3600_000);
    const token = await new SignJWT({ sv: claims.sv, role: claims.role })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(claims.sub)
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
      .sign(this.key);
    return { token, expiresAt };
  }

  async verify(token: string): Promise<SessionClaims | null> {
    try {
      const { payload } = await jwtVerify(token, this.key, { issuer: ISSUER, audience: AUDIENCE, algorithms: ['HS256'] });
      if (typeof payload.sub !== 'string' || typeof payload['sv'] !== 'number') return null;
      return { sub: payload.sub, sv: payload['sv'], role: payload['role'] as UserRole };
    } catch {
      return null;
    }
  }

  static newGuestToken(): string {
    return randomBytes(32).toString('base64url');
  }

  static hashGuestToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
