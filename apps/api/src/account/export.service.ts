import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { EXPORT_FORMAT_VERSION } from '@bot-friend/shared';
import { AuditService } from '../audit/audit.service.js';
import { toConversationDto, toMessageDto } from '../conversations/conversations.mapper.js';
import { DB, type Db } from '../db/database.js';
import {
  contentReports,
  conversations,
  memoryItems,
  messages,
  subscriptions,
  userPreferences,
  type UserRow,
} from '../db/schema.js';
import { toPreferencesDto, toUserDto } from '../users/users.mapper.js';

/** Structured export of everything tied to the account (BF-026). */
@Injectable()
export class ExportService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly audit: AuditService,
  ) {}

  async export(user: UserRow) {
    const [prefs] = await this.db.select().from(userPreferences).where(eq(userPreferences.userId, user.id));
    const convos = await this.db
      .select()
      .from(conversations)
      .where(eq(conversations.userId, user.id))
      .orderBy(asc(conversations.createdAt));
    const msgs = await this.db
      .select()
      .from(messages)
      .where(and(eq(messages.userId, user.id), inArray(messages.role, ['user', 'assistant'])))
      .orderBy(asc(messages.createdAt));
    const byConvo = new Map<string, ReturnType<typeof toMessageDto>[]>();
    for (const m of msgs) {
      const list = byConvo.get(m.conversationId) ?? [];
      list.push(toMessageDto(m));
      byConvo.set(m.conversationId, list);
    }
    const memories = await this.db.select().from(memoryItems).where(eq(memoryItems.userId, user.id));
    const reports = await this.db.select().from(contentReports).where(eq(contentReports.reporterId, user.id));
    const subs = await this.db.select().from(subscriptions).where(eq(subscriptions.userId, user.id));

    await this.audit.record({ actorId: user.id, action: 'account.exported', targetType: 'user', targetId: user.id });

    return {
      formatVersion: EXPORT_FORMAT_VERSION,
      exportedAt: new Date().toISOString(),
      user: toUserDto(user),
      preferences: prefs ? toPreferencesDto(prefs) : null,
      conversations: convos.map((c) => ({ ...toConversationDto(c), messages: byConvo.get(c.id) ?? [] })),
      memories: memories.map((m) => ({ content: m.content, status: m.consentStatus, createdAt: m.createdAt.toISOString() })),
      reports: reports.map((r) => ({ messageId: r.messageId, category: r.category, status: r.status, createdAt: r.createdAt.toISOString() })),
      subscriptions: subs.map((s) => ({ provider: s.provider, productId: s.productId, status: s.status, expiresAt: s.expiresAt?.toISOString() ?? null })),
    };
  }
}
