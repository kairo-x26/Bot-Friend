import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import type { CreateReport, Report, ReportCategory } from '@bot-friend/shared';
import { AnalyticsService } from '../audit/audit.service.js';
import { ApiError } from '../common/api-error.js';
import { DB, type Db } from '../db/database.js';
import { contentReports, conversations, messages, type ReportRow } from '../db/schema.js';

/** Lower number = reviewed sooner. */
const PRIORITY: Record<ReportCategory, number> = {
  self_harm: 0,
  sexual: 1,
  harassment: 1,
  offensive: 2,
  misinformation: 2,
  other: 2,
  not_funny: 3,
};

export function toReportDto(row: ReportRow): Report {
  return {
    id: row.id,
    messageId: row.messageId,
    category: row.category,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
  };
}

@Injectable()
export class ReportsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly analytics: AnalyticsService,
  ) {}

  /**
   * Files a report on an AI reply (BF-015). Reporting the same message twice
   * returns the original case instead of opening a duplicate.
   */
  async create(userId: string, input: CreateReport): Promise<{ report: Report; created: boolean }> {
    const [message] = await this.db
      .select()
      .from(messages)
      .where(and(eq(messages.id, input.messageId), eq(messages.userId, userId)))
      .limit(1);
    if (!message || message.role !== 'assistant') throw ApiError.notFound('Message');

    const [prompt] = message.replyToId
      ? await this.db.select().from(messages).where(eq(messages.id, message.replyToId)).limit(1)
      : [];
    const [convo] = await this.db
      .select({ comedyStyle: conversations.comedyStyle })
      .from(conversations)
      .where(eq(conversations.id, message.conversationId));

    const [inserted] = await this.db
      .insert(contentReports)
      .values({
        reporterId: userId,
        messageId: message.id,
        conversationId: message.conversationId,
        category: input.category,
        note: input.note || null,
        priority: PRIORITY[input.category],
        evidence: {
          reportedContent: message.content,
          precedingUserContent: prompt?.content ?? null,
          modelId: message.modelId,
          promptVersion: message.promptVersion,
          comedyStyle: convo?.comedyStyle ?? null,
          messageCreatedAt: message.createdAt.toISOString(),
        },
      })
      .onConflictDoNothing({ target: [contentReports.reporterId, contentReports.messageId] })
      .returning();

    if (inserted) {
      this.analytics.track('report_submitted', userId, { category: input.category });
      return { report: toReportDto(inserted), created: true };
    }
    const [existing] = await this.db
      .select()
      .from(contentReports)
      .where(and(eq(contentReports.reporterId, userId), eq(contentReports.messageId, message.id)));
    return { report: toReportDto(existing!), created: false };
  }
}
