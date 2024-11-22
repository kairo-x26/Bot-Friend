import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { and, eq, lt } from 'drizzle-orm';
import { AppConfig } from '../config/config.js';
import { DB, type Db } from '../db/database.js';
import { analyticsEvents, messages, users } from '../db/schema.js';
import { DeletionService } from './deletion.service.js';

export interface SweepResult {
  guestsPurged: number;
  analyticsPurged: number;
  staleStreamsFailed: number;
  deletionJobsRetried: number;
}

/** Periodic housekeeping for the retention schedule in PRD §9. */
@Injectable()
export class RetentionService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger('RetentionService');
  private timer: NodeJS.Timeout | null = null;

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly config: AppConfig,
    private readonly deletion: DeletionService,
  ) {}

  onApplicationBootstrap() {
    const minutes = this.config.env.RETENTION_SWEEP_MINUTES;
    if (minutes <= 0) return;
    this.timer = setInterval(() => {
      this.sweep().catch((err: Error) => this.logger.error(`Sweep failed: ${err.message}`));
    }, minutes * 60_000);
    this.timer.unref();
  }

  onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
  }

  async sweep(now = new Date()): Promise<SweepResult> {
    const day = 86_400_000;
    const guestCutoff = new Date(now.getTime() - this.config.env.GUEST_RETENTION_DAYS * day);
    const analyticsCutoff = new Date(now.getTime() - this.config.env.ANALYTICS_RETENTION_DAYS * day);
    const streamCutoff = new Date(now.getTime() - 5 * 60_000);

    const guests = await this.db
      .delete(users)
      .where(and(eq(users.provider, 'guest'), lt(users.createdAt, guestCutoff)))
      .returning({ id: users.id });
    const analytics = await this.db
      .delete(analyticsEvents)
      .where(lt(analyticsEvents.occurredAt, analyticsCutoff))
      .returning({ id: analyticsEvents.id });
    // Replies left "streaming" by a crash or deploy would otherwise block retries forever.
    const stale = await this.db
      .update(messages)
      .set({ status: 'failed', errorCode: 'interrupted', updatedAt: now })
      .where(and(eq(messages.status, 'streaming'), lt(messages.createdAt, streamCutoff)))
      .returning({ id: messages.id });
    const retried = await this.deletion.retryPending();

    const result = {
      guestsPurged: guests.length,
      analyticsPurged: analytics.length,
      staleStreamsFailed: stale.length,
      deletionJobsRetried: retried,
    };
    if (Object.values(result).some((n) => n > 0)) this.logger.log(`Retention sweep: ${JSON.stringify(result)}`);
    return result;
  }
}
