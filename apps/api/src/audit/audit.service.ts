import { Inject, Injectable, Logger } from '@nestjs/common';
import { DB, type Db, type DbOrTx } from '../db/database.js';
import { analyticsEvents, auditEvents } from '../db/schema.js';

export interface AuditEntry {
  actorId: string | null;
  action: string;
  targetType: string;
  targetId: string;
  metadata?: Record<string, unknown>;
}

/** Append-only record of administrative and safety-relevant actions. */
@Injectable()
export class AuditService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async record(entry: AuditEntry, db: DbOrTx = this.db) {
    await db.insert(auditEvents).values({ ...entry, metadata: entry.metadata ?? {} });
  }
}

export type AnalyticsEventName =
  | 'chat_started'
  | 'reply_completed'
  | 'reply_failed'
  | 'reply_blocked'
  | 'reply_rated'
  | 'game_started'
  | 'report_submitted'
  | 'subscription_activated'
  | 'memory_saved'
  | 'account_deleted';

type Props = Record<string, string | number | boolean | null>;

/**
 * Product analytics without chat content (PRD §9). String values are capped so
 * message text can't sneak into events by accident.
 */
@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger('Analytics');

  constructor(@Inject(DB) private readonly db: Db) {}

  track(name: AnalyticsEventName, userId: string | null, properties: Props = {}): void {
    const safe: Props = {};
    for (const [key, value] of Object.entries(properties)) {
      safe[key] = typeof value === 'string' && value.length > 48 ? null : value;
    }
    void this.db
      .insert(analyticsEvents)
      .values({ name, userId, properties: safe })
      .catch((err: Error) => this.logger.warn(`Dropped analytics event ${name}: ${err.message}`));
  }
}
