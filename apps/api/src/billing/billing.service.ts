import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, eq, gt, inArray, lt, or, isNull } from 'drizzle-orm';
import { ErrorCode, type SubscriptionStatus, type VerifyPurchase } from '@bot-friend/shared';
import { AnalyticsService, AuditService } from '../audit/audit.service.js';
import { ApiError } from '../common/api-error.js';
import { AppConfig } from '../config/config.js';
import { DB, type Db, type DbOrTx } from '../db/database.js';
import { billingEvents, subscriptions, users, type UserRow } from '../db/schema.js';
import {
  InvalidReceiptError,
  STORE_VERIFIER,
  type StoreVerifier,
  type VerifiedPurchase,
} from './store-verifier.js';

/** Premium entitlement from verified store purchases (BF-025). */
@Injectable()
export class BillingService {
  private readonly logger = new Logger('BillingService');

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(STORE_VERIFIER) private readonly verifier: StoreVerifier,
    private readonly config: AppConfig,
    private readonly analytics: AnalyticsService,
    private readonly audit: AuditService,
  ) {}

  assertEnabled() {
    if (!this.config.env.FEATURE_BILLING)
      throw new ApiError(ErrorCode.FeatureDisabled, 'Premium isn’t available yet');
  }

  async status(user: UserRow): Promise<SubscriptionStatus> {
    const [sub] = await this.db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, user.id))
      .orderBy(subscriptions.updatedAt)
      .limit(1);
    const [fresh] = await this.db
      .select({ entitlement: users.entitlement })
      .from(users)
      .where(eq(users.id, user.id));
    return {
      entitlement: fresh?.entitlement ?? user.entitlement,
      subscription: sub
        ? {
            provider: sub.provider,
            productId: sub.productId,
            status: sub.status,
            expiresAt: sub.expiresAt?.toISOString() ?? null,
          }
        : null,
    };
  }

  /** Purchase and restore both land here: the client sends what the store gave it. */
  async verifyPurchase(user: UserRow, input: VerifyPurchase): Promise<SubscriptionStatus> {
    this.assertEnabled();
    if (user.provider === 'guest')
      throw ApiError.forbidden('Create an account before subscribing so your purchase is saved.');
    let verified: VerifiedPurchase;
    try {
      verified = await this.verifier.verify(input.provider, input.productId, input.receipt);
    } catch (err) {
      if (err instanceof InvalidReceiptError)
        throw new ApiError(ErrorCode.ValidationFailed, 'That purchase couldn’t be verified.');
      throw new ApiError(
        ErrorCode.ProviderUnavailable,
        'The store didn’t respond. Try restoring again in a moment.',
      );
    }
    await this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(subscriptions)
        .where(
          and(
            eq(subscriptions.provider, verified.provider),
            eq(subscriptions.originalTransactionId, verified.originalTransactionId),
          ),
        );
      if (existing && existing.userId !== user.id) {
        const [owner] = await tx
          .select({ status: users.status })
          .from(users)
          .where(eq(users.id, existing.userId));
        if (owner && owner.status === 'active') {
          throw new ApiError(
            ErrorCode.Conflict,
            'This subscription belongs to a different Bot-Friend account.',
          );
        }
      }
      await this.upsert(tx, user.id, verified);
      await this.recompute(tx, user.id);
    });
    if (verified.status === 'active')
      this.analytics.track('subscription_activated', user.id, {
        provider: verified.provider,
        productId: verified.productId,
      });
    return this.status(user);
  }

  /**
   * Store server notifications. `eventId` is the provider's notification id,
   * recorded first so a redelivered webhook is a no-op.
   */
  async applyNotification(
    provider: 'apple' | 'google',
    eventId: string,
    type: string,
    purchase: VerifiedPurchase,
  ): Promise<'applied' | 'duplicate' | 'unknown'> {
    return this.db.transaction(async (tx) => {
      const inserted = await tx
        .insert(billingEvents)
        .values({ id: `${provider}:${eventId}`, provider, type })
        .onConflictDoNothing()
        .returning();
      if (inserted.length === 0) return 'duplicate';
      const [existing] = await tx
        .select()
        .from(subscriptions)
        .where(
          and(
            eq(subscriptions.provider, provider),
            eq(subscriptions.originalTransactionId, purchase.originalTransactionId),
          ),
        );
      if (!existing) {
        // Purchase not linked to an account yet; the client's verify call will create it.
        this.logger.warn(`Billing notification for unknown subscription (${provider})`);
        return 'unknown';
      }
      await this.upsert(tx, existing.userId, purchase);
      await this.recompute(tx, existing.userId);
      await this.audit.record(
        {
          actorId: null,
          action: `billing.${type.toLowerCase()}`,
          targetType: 'user',
          targetId: existing.userId,
          metadata: { status: purchase.status },
        },
        tx,
      );
      return 'applied';
    });
  }

  get store() {
    return this.verifier;
  }

  /** Downgrades accounts whose subscriptions lapsed without a notification. */
  async expireLapsed(now = new Date()): Promise<number> {
    const lapsed = await this.db
      .update(subscriptions)
      .set({ status: 'expired', updatedAt: now })
      .where(
        and(
          inArray(subscriptions.status, ['active', 'grace']),
          lt(subscriptions.expiresAt, new Date(now.getTime() - 3 * 86_400_000)),
        ),
      )
      .returning({ userId: subscriptions.userId });
    for (const { userId } of lapsed) await this.recompute(this.db, userId);
    return lapsed.length;
  }

  private async upsert(tx: DbOrTx, userId: string, v: VerifiedPurchase) {
    await tx
      .insert(subscriptions)
      .values({
        userId,
        provider: v.provider,
        productId: v.productId,
        originalTransactionId: v.originalTransactionId,
        status: v.status,
        expiresAt: v.expiresAt,
      })
      .onConflictDoUpdate({
        target: [subscriptions.provider, subscriptions.originalTransactionId],
        set: {
          userId,
          productId: v.productId,
          status: v.status,
          expiresAt: v.expiresAt,
          updatedAt: new Date(),
        },
      });
  }

  private async recompute(tx: DbOrTx, userId: string) {
    const now = new Date();
    const active = await tx
      .select({ id: subscriptions.id })
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.userId, userId),
          inArray(subscriptions.status, ['active', 'grace']),
          or(isNull(subscriptions.expiresAt), gt(subscriptions.expiresAt, now)),
        ),
      )
      .limit(1);
    await tx
      .update(users)
      .set({ entitlement: active.length ? 'premium' : 'free', updatedAt: now })
      .where(and(eq(users.id, userId), inArray(users.entitlement, ['free', 'premium'])));
  }
}
