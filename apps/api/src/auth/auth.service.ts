import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { ErrorCode, type CreateSessionRequest, type SessionResponse } from '@bot-friend/shared';
import { ApiError } from '../common/api-error.js';
import { AppConfig } from '../config/config.js';
import { DB, type Db, type Tx } from '../db/database.js';
import { conversations, memoryItems, messages, userPreferences, users, type UserRow } from '../db/schema.js';
import { toUserDto } from '../users/users.mapper.js';
import { ID_TOKEN_VERIFIER, type IdTokenVerifier } from './id-token-verifier.js';
import { TokenService } from './token.service.js';

@Injectable()
export class AuthService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(ID_TOKEN_VERIFIER) private readonly verifier: IdTokenVerifier,
    private readonly tokens: TokenService,
    private readonly config: AppConfig,
  ) {}

  async createSession(req: CreateSessionRequest): Promise<SessionResponse> {
    // BF-003: adults only. Nothing is stored for an ineligible user.
    if (!req.ageConfirmed) {
      throw new ApiError(ErrorCode.AgeIneligible, 'Bot-Friend is only available to adults (18+).');
    }

    if (req.provider === 'guest') return this.guestSession(req.guestToken);

    let subject: string;
    let name: string | null = null;
    if (req.provider === 'dev') {
      if (!this.config.env.AUTH_DEV_LOGIN) throw new ApiError(ErrorCode.FeatureDisabled, 'Dev login is disabled');
      subject = req.email.toLowerCase();
      name = subject.split('@')[0] ?? null;
    } else {
      ({ subject, name } = await this.verifier.verify(req.provider, req.idToken));
    }

    const user = await this.db.transaction(async (tx) => {
      const account = await this.upsertAccount(tx, req.provider, subject, name);
      if (req.upgradeGuestToken) await this.absorbGuest(tx, req.upgradeGuestToken, account);
      return account;
    });
    return this.issue(user);
  }

  private async guestSession(guestToken: string | undefined): Promise<SessionResponse> {
    if (guestToken) {
      const [existing] = await this.db
        .select()
        .from(users)
        .where(and(eq(users.provider, 'guest'), eq(users.providerSubject, TokenService.hashGuestToken(guestToken))))
        .limit(1);
      if (existing && existing.status === 'active') return this.issue(existing, guestToken);
      // Unknown, purged or deleted guest: start a fresh trial below.
    }
    const token = TokenService.newGuestToken();
    const user = await this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(users)
        .values({ provider: 'guest', providerSubject: TokenService.hashGuestToken(token), entitlement: 'guest' })
        .returning();
      await tx.insert(userPreferences).values({ userId: row!.id });
      return row!;
    });
    return this.issue(user, token);
  }

  private async upsertAccount(tx: Tx, provider: UserRow['provider'], subject: string, name: string | null) {
    const [existing] = await tx
      .select()
      .from(users)
      .where(and(eq(users.provider, provider), eq(users.providerSubject, subject)))
      .limit(1);
    if (existing) {
      this.assertUsable(existing);
      return existing;
    }
    const devAdmin = provider === 'dev' && this.config.env.DEV_ADMIN_EMAILS.map((e) => e.toLowerCase()).includes(subject);
    const [created] = await tx
      .insert(users)
      .values({ provider, providerSubject: subject, displayName: name, entitlement: 'free', role: devAdmin ? 'admin' : 'user' })
      .returning();
    await tx.insert(userPreferences).values({ userId: created!.id });
    return created!;
  }

  /** Moves a guest's conversations, memories and preferences onto the signed-in account. */
  private async absorbGuest(tx: Tx, guestToken: string, account: UserRow) {
    const [guest] = await tx
      .select()
      .from(users)
      .where(and(eq(users.provider, 'guest'), eq(users.providerSubject, TokenService.hashGuestToken(guestToken))))
      .limit(1);
    if (!guest || guest.id === account.id || guest.status !== 'active') return;

    await tx.update(conversations).set({ userId: account.id }).where(eq(conversations.userId, guest.id));
    await tx.update(messages).set({ userId: account.id }).where(eq(messages.userId, guest.id));
    await tx.update(memoryItems).set({ userId: account.id }).where(eq(memoryItems.userId, guest.id));

    const isNewAccount = Date.now() - account.createdAt.getTime() < 60_000;
    if (isNewAccount) {
      const [prefs] = await tx.select().from(userPreferences).where(eq(userPreferences.userId, guest.id));
      if (prefs) {
        const { userId: _ignored, ...rest } = prefs;
        await tx.update(userPreferences).set({ ...rest, updatedAt: new Date() }).where(eq(userPreferences.userId, account.id));
      }
    }
    await tx.delete(users).where(eq(users.id, guest.id));
  }

  private assertUsable(user: UserRow) {
    if (user.status === 'suspended') throw ApiError.forbidden('This account is suspended. Contact support.');
    if (user.status !== 'active') throw new ApiError(ErrorCode.AccountDeleted, 'This account has been deleted');
  }

  private async issue(user: UserRow, guestToken?: string): Promise<SessionResponse> {
    const { token, expiresAt } = await this.tokens.sign({ sub: user.id, sv: user.sessionVersion, role: user.role });
    return { accessToken: token, expiresAt: expiresAt.toISOString(), guestToken, user: toUserDto(user) };
  }
}
