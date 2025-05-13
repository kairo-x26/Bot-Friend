import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, eq, inArray, lt, sql } from 'drizzle-orm';
import type { AccountDeletionResponse } from '@bot-friend/shared';
import { AnalyticsService, AuditService } from '../audit/audit.service.js';
import { DB, type Db } from '../db/database.js';
import {
  analyticsEvents,
  conversations,
  deletionJobs,
  memoryItems,
  pushDevices,
  subscriptions,
  users,
  type UserRow,
} from '../db/schema.js';

const MAX_ATTEMPTS = 5;

/**
 * Account deletion (BF-016, Workflow D). Access is revoked immediately; data
 * removal runs as an auditable, retryable job made of idempotent steps.
 */
@Injectable()
export class DeletionService {
  private readonly logger = new Logger('DeletionService');

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly audit: AuditService,
    private readonly analytics: AnalyticsService,
  ) {}

  async request(user: UserRow): Promise<AccountDeletionResponse> {
    const job = await this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(deletionJobs)
        .where(
          and(
            eq(deletionJobs.userId, user.id),
            inArray(deletionJobs.status, ['scheduled', 'running', 'failed']),
          ),
        );
      // Revoke every session right away by bumping the session version.
      await tx
        .update(users)
        .set({
          status: 'deleting',
          sessionVersion: sql`${users.sessionVersion} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(users.id, user.id));
      if (existing) return existing;
      const [created] = await tx.insert(deletionJobs).values({ userId: user.id }).returning();
      await this.audit.record(
        {
          actorId: user.id,
          action: 'account.deletion_requested',
          targetType: 'user',
          targetId: user.id,
        },
        tx,
      );
      return created!;
    });
    setImmediate(() => void this.process(job.id));
    return { jobId: job.id, status: job.status };
  }

  /** Runs (or resumes) one job. Safe to call repeatedly. */
  async process(jobId: string): Promise<void> {
    const [job] = await this.db
      .update(deletionJobs)
      .set({ status: 'running', attempts: sql`${deletionJobs.attempts} + 1` })
      .where(and(eq(deletionJobs.id, jobId), inArray(deletionJobs.status, ['scheduled', 'failed'])))
      .returning();
    if (!job) return;

    const steps: Record<string, string> = { ...job.steps };
    const userId = job.userId;
    const run = async (name: string, fn: () => Promise<unknown>) => {
      if (steps[name] === 'done') return;
      await fn();
      steps[name] = 'done';
      await this.db.update(deletionJobs).set({ steps }).where(eq(deletionJobs.id, jobId));
    };

    try {
      // Conversations cascade to messages.
      await run('conversations', () =>
        this.db.delete(conversations).where(eq(conversations.userId, userId)),
      );
      await run('memories', () =>
        this.db.delete(memoryItems).where(eq(memoryItems.userId, userId)),
      );
      await run('push_devices', () =>
        this.db.delete(pushDevices).where(eq(pushDevices.userId, userId)),
      );
      await run('subscriptions', () =>
        this.db.delete(subscriptions).where(eq(subscriptions.userId, userId)),
      );
      await run('analytics', () =>
        this.db.delete(analyticsEvents).where(eq(analyticsEvents.userId, userId)),
      );
      // Deleting the user cascades preferences and usage counters; usage records and
      // reports keep their rows with the user id nulled (cost accounting / safety evidence).
      await run('user', () => this.db.delete(users).where(eq(users.id, userId)));

      await this.db
        .update(deletionJobs)
        .set({ status: 'completed', completedAt: new Date(), steps, lastError: null })
        .where(eq(deletionJobs.id, jobId));
      await this.audit.record({
        actorId: null,
        action: 'account.deleted',
        targetType: 'user',
        targetId: userId,
      });
      this.analytics.track('account_deleted', null, {});
    } catch (err) {
      const message = (err as Error).message.slice(0, 500);
      this.logger.error(`Deletion job ${jobId} failed (attempt ${job.attempts}): ${message}`);
      await this.db
        .update(deletionJobs)
        .set({ status: 'failed', lastError: message, steps })
        .where(eq(deletionJobs.id, jobId));
    }
  }

  /** Picks up jobs that failed or were interrupted by a restart. */
  async retryPending(): Promise<number> {
    const stale = new Date(Date.now() - 10 * 60_000);
    await this.db
      .update(deletionJobs)
      .set({ status: 'failed', lastError: 'interrupted' })
      .where(and(eq(deletionJobs.status, 'running'), lt(deletionJobs.requestedAt, stale)));
    const jobs = await this.db
      .select({ id: deletionJobs.id })
      .from(deletionJobs)
      .where(
        and(
          inArray(deletionJobs.status, ['scheduled', 'failed']),
          lt(deletionJobs.attempts, MAX_ATTEMPTS),
        ),
      );
    for (const job of jobs) await this.process(job.id);
    return jobs.length;
  }
}
