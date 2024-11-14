import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gte, sql, sum } from 'drizzle-orm';
import { ErrorCode, type Entitlement, type UsageResponse } from '@bot-friend/shared';
import { ApiError } from '../common/api-error.js';
import { AppConfig } from '../config/config.js';
import { DB, type Db } from '../db/database.js';
import { usageCounters, usageRecords, type UserRow } from '../db/schema.js';
import { RateLimiter } from './rate-limiter.js';

export const RATE_LIMITER = Symbol('RATE_LIMITER');

function utcDay(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}
function nextUtcMidnight(d = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1));
}

@Injectable()
export class QuotaService {
  private spendCache: { at: number; micros: number } | null = null;

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(RATE_LIMITER) private readonly limiter: RateLimiter,
    private readonly config: AppConfig,
  ) {}

  dailyLimit(entitlement: Entitlement): number {
    const { QUOTA_GUEST_DAILY, QUOTA_FREE_DAILY, QUOTA_PREMIUM_DAILY } = this.config.env;
    return { guest: QUOTA_GUEST_DAILY, free: QUOTA_FREE_DAILY, premium: QUOTA_PREMIUM_DAILY }[entitlement];
  }

  /** Per-user burst limit on message submissions (BF-017). */
  async checkMessageRate(userId: string): Promise<void> {
    const res = await this.limiter.hit(`msg:${userId}`, this.config.env.RATE_LIMIT_MESSAGES_PER_MINUTE, 60_000);
    if (!res.allowed) {
      throw new ApiError(ErrorCode.RateLimited, 'Whoa, that’s a lot of messages. Take a breath and try again in a moment.', {
        retryAfterSeconds: res.retryAfterSeconds,
      });
    }
  }

  async checkAuthRate(ip: string): Promise<void> {
    const res = await this.limiter.hit(`auth:${ip}`, this.config.env.RATE_LIMIT_AUTH_PER_MINUTE, 60_000);
    if (!res.allowed) {
      throw new ApiError(ErrorCode.RateLimited, 'Too many sign-in attempts. Try again shortly.', {
        retryAfterSeconds: res.retryAfterSeconds,
      });
    }
  }

  /**
   * Atomically takes one message from today's allowance. The conditional upsert
   * means concurrent requests can never push the counter past the limit.
   */
  async consumeMessage(user: UserRow): Promise<void> {
    await this.assertBudget();
    const limit = this.dailyLimit(user.entitlement);
    const rows = await this.db
      .insert(usageCounters)
      .values({ userId: user.id, day: utcDay(), messages: 1 })
      .onConflictDoUpdate({
        target: [usageCounters.userId, usageCounters.day],
        set: { messages: sql`${usageCounters.messages} + 1` },
        setWhere: sql`${usageCounters.messages} < ${limit}`,
      })
      .returning({ messages: usageCounters.messages });
    if (rows.length === 0 || limit === 0) {
      throw new ApiError(
        ErrorCode.QuotaExceeded,
        user.entitlement === 'guest'
          ? 'You’ve used today’s free trial messages. Sign in to keep chatting.'
          : 'You’ve reached today’s message limit. It resets at midnight UTC.',
        {
          details: { entitlement: user.entitlement, limit, resetsAt: nextUtcMidnight().toISOString() },
          retryAfterSeconds: Math.ceil((nextUtcMidnight().getTime() - Date.now()) / 1000),
        },
      );
    }
  }

  async usage(user: UserRow): Promise<UsageResponse> {
    const [row] = await this.db
      .select()
      .from(usageCounters)
      .where(and(eq(usageCounters.userId, user.id), eq(usageCounters.day, utcDay())));
    return {
      entitlement: user.entitlement,
      period: 'day',
      messagesUsed: row?.messages ?? 0,
      messagesLimit: this.dailyLimit(user.entitlement),
      resetsAt: nextUtcMidnight().toISOString(),
    };
  }

  /** Service-wide provider spend ceiling, cached briefly to keep the hot path cheap. */
  private async assertBudget() {
    const budgetUsd = this.config.env.AI_DAILY_BUDGET_USD;
    if (budgetUsd <= 0) return;
    const now = Date.now();
    if (!this.spendCache || now - this.spendCache.at > 30_000) {
      const start = new Date(`${utcDay()}T00:00:00.000Z`);
      const [row] = await this.db
        .select({ total: sum(usageRecords.estimatedCostMicros) })
        .from(usageRecords)
        .where(gte(usageRecords.createdAt, start));
      this.spendCache = { at: now, micros: Number(row?.total ?? 0) };
    }
    if (this.spendCache.micros >= budgetUsd * 1_000_000) {
      throw new ApiError(ErrorCode.ProviderUnavailable, 'Bot-Friend is taking a short break. Try again later.', {
        retryAfterSeconds: 600,
      });
    }
  }
}
