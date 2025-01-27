import { Inject, Injectable } from '@nestjs/common';
import { and, count, desc, eq, gt, gte, inArray, lt, or, sql } from 'drizzle-orm';
import {
  ErrorCode,
  type AdminMetrics,
  type AdminReport,
  type AdminReportDetail,
  type AdminReportPage,
  type AdminReportQuery,
  type AdminUser,
  type AuditPage,
  type PaginationQuery,
  type ResolveReport,
  type UserRole,
} from '@bot-friend/shared';
import { AuditService } from '../audit/audit.service.js';
import { ApiError } from '../common/api-error.js';
import { decodeCursor, encodeCursor } from '../common/cursor.js';
import { DB, type Db } from '../db/database.js';
import {
  auditEvents,
  contentReports,
  conversations,
  deletionJobs,
  messages,
  usageCounters,
  usageRecords,
  users,
  type ReportRow,
  type UserRow,
} from '../db/schema.js';

function toAdminReport(row: ReportRow): AdminReport {
  return {
    id: row.id,
    messageId: row.messageId,
    conversationId: row.conversationId,
    reporterId: row.reporterId,
    category: row.category,
    status: row.status,
    priority: row.priority,
    note: row.note,
    createdAt: row.createdAt.toISOString(),
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
  };
}

function encodeQueueCursor(row: ReportRow) {
  return Buffer.from(JSON.stringify({ p: row.priority, t: row.createdAt.toISOString(), id: row.id })).toString('base64url');
}
function decodeQueueCursor(raw?: string) {
  if (!raw) return null;
  try {
    const c = JSON.parse(Buffer.from(raw, 'base64url').toString()) as { p: number; t: string; id: string };
    const at = new Date(c.t);
    if (typeof c.p !== 'number' || typeof c.id !== 'string' || Number.isNaN(at.getTime())) throw new Error();
    return { p: c.p, at, id: c.id };
  } catch {
    throw new ApiError(ErrorCode.ValidationFailed, 'Invalid cursor');
  }
}

/** Restricted moderation and support operations (BF-018). Every write is audited. */
@Injectable()
export class AdminService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly audit: AuditService,
  ) {}

  /** Queue ordered by urgency, then oldest first. */
  async listReports(q: AdminReportQuery): Promise<AdminReportPage> {
    const after = decodeQueueCursor(q.cursor);
    const rows = await this.db
      .select()
      .from(contentReports)
      .where(
        and(
          q.status ? eq(contentReports.status, q.status) : undefined,
          q.category ? eq(contentReports.category, q.category) : undefined,
          after
            ? or(
                gt(contentReports.priority, after.p),
                and(eq(contentReports.priority, after.p), gt(contentReports.createdAt, after.at)),
                and(eq(contentReports.priority, after.p), eq(contentReports.createdAt, after.at), gt(contentReports.id, after.id)),
              )
            : undefined,
        ),
      )
      .orderBy(contentReports.priority, contentReports.createdAt, contentReports.id)
      .limit(q.limit + 1);
    const page = rows.slice(0, q.limit);
    return {
      items: page.map(toAdminReport),
      nextCursor: rows.length > q.limit && page.length ? encodeQueueCursor(page.at(-1)!) : null,
    };
  }

  async getReport(actor: UserRow, id: string): Promise<AdminReportDetail> {
    const [row] = await this.db.select().from(contentReports).where(eq(contentReports.id, id));
    if (!row) throw ApiError.notFound('Report');
    // Viewing user content is itself an auditable action.
    await this.audit.record({ actorId: actor.id, action: 'report.viewed', targetType: 'report', targetId: id });
    return { ...toAdminReport(row), evidence: row.evidence, resolution: row.resolution, resolvedBy: row.resolvedBy };
  }

  async resolveReport(actor: UserRow, id: string, input: ResolveReport): Promise<AdminReportDetail> {
    const [row] = await this.db.transaction(async (tx) => {
      const updated = await tx
        .update(contentReports)
        .set({
          status: input.status,
          resolution: input.resolution,
          resolvedBy: actor.id,
          resolvedAt: input.status === 'triaged' ? null : new Date(),
        })
        .where(eq(contentReports.id, id))
        .returning();
      if (updated.length === 0) throw ApiError.notFound('Report');
      await this.audit.record(
        { actorId: actor.id, action: `report.${input.status}`, targetType: 'report', targetId: id, metadata: { resolution: input.resolution } },
        tx,
      );
      return updated;
    });
    return { ...toAdminReport(row!), evidence: row!.evidence, resolution: row!.resolution, resolvedBy: row!.resolvedBy };
  }

  async getUser(id: string): Promise<AdminUser> {
    const [user] = await this.db.select().from(users).where(eq(users.id, id));
    if (!user) throw ApiError.notFound('User');
    const today = new Date().toISOString().slice(0, 10);
    const [[convos], [reports], [counter], [blocked]] = await Promise.all([
      this.db.select({ n: count() }).from(conversations).where(eq(conversations.userId, id)),
      this.db.select({ n: count() }).from(contentReports).where(eq(contentReports.reporterId, id)),
      this.db.select().from(usageCounters).where(and(eq(usageCounters.userId, id), eq(usageCounters.day, today))),
      this.db
        .select({ n: count() })
        .from(messages)
        .where(and(eq(messages.userId, id), eq(messages.role, 'assistant'), eq(messages.status, 'blocked'))),
    ]);
    return {
      id: user.id,
      provider: user.provider,
      role: user.role,
      status: user.status,
      entitlement: user.entitlement,
      createdAt: user.createdAt.toISOString(),
      lastSeenAt: user.lastSeenAt?.toISOString() ?? null,
      stats: {
        conversations: convos?.n ?? 0,
        reportsFiled: reports?.n ?? 0,
        messagesToday: counter?.messages ?? 0,
        blockedReplies: blocked?.n ?? 0,
      },
    };
  }

  async setStatus(actor: UserRow, id: string, status: 'active' | 'suspended', reason: string): Promise<AdminUser> {
    if (actor.id === id) throw ApiError.forbidden('You cannot change your own account status');
    await this.db.transaction(async (tx) => {
      const updated = await tx
        .update(users)
        .set({
          status,
          // Suspension revokes sessions; reinstating doesn't need to.
          ...(status === 'suspended' ? { sessionVersion: sql`${users.sessionVersion} + 1` } : {}),
          updatedAt: new Date(),
        })
        .where(and(eq(users.id, id), inArray(users.status, ['active', 'suspended'])))
        .returning({ id: users.id });
      if (updated.length === 0) throw ApiError.notFound('User');
      await this.audit.record(
        { actorId: actor.id, action: status === 'suspended' ? 'user.suspended' : 'user.reinstated', targetType: 'user', targetId: id, metadata: { reason } },
        tx,
      );
    });
    return this.getUser(id);
  }

  async setRole(actor: UserRow, id: string, role: UserRole): Promise<AdminUser> {
    if (actor.id === id) throw ApiError.forbidden('You cannot change your own role');
    const [target] = await this.db.select().from(users).where(eq(users.id, id));
    if (!target || target.provider === 'guest') throw ApiError.notFound('User');
    await this.db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({ role, sessionVersion: sql`${users.sessionVersion} + 1`, updatedAt: new Date() })
        .where(eq(users.id, id));
      await this.audit.record(
        { actorId: actor.id, action: 'user.role_changed', targetType: 'user', targetId: id, metadata: { from: target.role, to: role } },
        tx,
      );
    });
    return this.getUser(id);
  }

  async auditLog({ cursor, limit }: PaginationQuery): Promise<AuditPage> {
    const before = decodeCursor(cursor);
    const rows = await this.db
      .select()
      .from(auditEvents)
      .where(
        before
          ? or(lt(auditEvents.occurredAt, before.at), and(eq(auditEvents.occurredAt, before.at), lt(auditEvents.id, before.id)))
          : undefined,
      )
      .orderBy(desc(auditEvents.occurredAt), desc(auditEvents.id))
      .limit(limit + 1);
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return {
      items: page.map((r) => ({ ...r, occurredAt: r.occurredAt.toISOString() })),
      nextCursor: rows.length > limit && last ? encodeCursor(last.occurredAt, last.id) : null,
    };
  }

  async metrics(): Promise<AdminMetrics> {
    const since = new Date(Date.now() - 86_400_000);
    const [[open], [urgent], [msgs], [active], [blocked], [failed], [cost], [failedJobs], [ratings]] = await Promise.all([
      this.db.select({ n: count() }).from(contentReports).where(inArray(contentReports.status, ['open', 'triaged'])),
      this.db
        .select({ n: count() })
        .from(contentReports)
        .where(and(inArray(contentReports.status, ['open', 'triaged']), lt(contentReports.priority, 2))),
      this.db.select({ n: count() }).from(messages).where(and(eq(messages.role, 'user'), gte(messages.createdAt, since))),
      this.db
        .select({ n: sql<number>`count(distinct ${messages.userId})`.mapWith(Number) })
        .from(messages)
        .where(gte(messages.createdAt, since)),
      this.db
        .select({ n: count() })
        .from(messages)
        .where(and(eq(messages.role, 'assistant'), eq(messages.status, 'blocked'), gte(messages.createdAt, since))),
      this.db
        .select({ n: count() })
        .from(messages)
        .where(and(eq(messages.role, 'assistant'), eq(messages.status, 'failed'), gte(messages.createdAt, since))),
      this.db
        .select({
          micros: sql<number>`coalesce(sum(${usageRecords.estimatedCostMicros}), 0)`.mapWith(Number),
          p95: sql<number | null>`percentile_cont(0.95) within group (order by ${usageRecords.durationMs})`,
        })
        .from(usageRecords)
        .where(and(gte(usageRecords.createdAt, since), eq(usageRecords.kind, 'chat'))),
      this.db.select({ n: count() }).from(deletionJobs).where(eq(deletionJobs.status, 'failed')),
      this.db
        .select({
          rated: count(),
          positive: sql<number>`count(*) filter (where ${messages.reaction} in ('laugh', 'love', 'up'))`.mapWith(Number),
        })
        .from(messages)
        .where(and(eq(messages.role, 'assistant'), sql`${messages.reaction} is not null`, gte(messages.updatedAt, since))),
    ]);
    return {
      openReports: { total: open?.n ?? 0, urgent: urgent?.n ?? 0 },
      last24h: {
        messages: msgs?.n ?? 0,
        activeUsers: active?.n ?? 0,
        blockedReplies: blocked?.n ?? 0,
        failedReplies: failed?.n ?? 0,
        estimatedCostUsd: Math.round((cost?.micros ?? 0) / 10_000) / 100,
        p95LatencyMs: cost?.p95 == null ? null : Math.round(Number(cost.p95)),
        ratedReplies: ratings?.rated ?? 0,
        positiveRatingShare: ratings?.rated ? Math.round((ratings.positive / ratings.rated) * 100) / 100 : null,
      },
      failedDeletionJobs: failedJobs?.n ?? 0,
    };
  }
}
