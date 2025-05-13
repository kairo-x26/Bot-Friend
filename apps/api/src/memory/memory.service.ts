import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, asc, count, eq, inArray } from 'drizzle-orm';
import {
  ErrorCode,
  MAX_MEMORIES,
  type Memory,
  type MemoryList,
  type UpdateMemory,
} from '@bot-friend/shared';
import { AnalyticsService } from '../audit/audit.service.js';
import { ApiError } from '../common/api-error.js';
import { AppConfig } from '../config/config.js';
import { DB, type Db } from '../db/database.js';
import { memoryItems, type MemoryRow } from '../db/schema.js';
import { UsersService } from '../users/users.service.js';
import { extractMemorySuggestions } from './extractor.js';

function toDto(row: MemoryRow): Memory {
  return {
    id: row.id,
    content: row.content,
    status: row.consentStatus === 'approved' ? 'approved' : 'suggested',
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** User-controlled long-term memory (BF-019, BF-020). */
@Injectable()
export class MemoryService {
  private readonly logger = new Logger('MemoryService');

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly users: UsersService,
    private readonly config: AppConfig,
    private readonly analytics: AnalyticsService,
  ) {}

  private assertFeature() {
    if (!this.config.env.FEATURE_MEMORY)
      throw new ApiError(ErrorCode.FeatureDisabled, 'Memories are not available yet');
  }

  async list(userId: string): Promise<MemoryList> {
    this.assertFeature();
    const [prefs, rows] = await Promise.all([
      this.users.preferences(userId),
      this.db
        .select()
        .from(memoryItems)
        .where(
          and(
            eq(memoryItems.userId, userId),
            inArray(memoryItems.consentStatus, ['suggested', 'approved']),
          ),
        )
        .orderBy(asc(memoryItems.createdAt)),
    ]);
    return { enabled: prefs.memoryEnabled, items: rows.map(toDto) };
  }

  async create(userId: string, content: string): Promise<Memory> {
    this.assertFeature();
    await this.assertRoom(userId);
    const [row] = await this.db
      .insert(memoryItems)
      .values({ userId, content, consentStatus: 'approved' })
      .returning();
    this.analytics.track('memory_saved', userId, { source: 'manual' });
    return toDto(row!);
  }

  async update(userId: string, id: string, patch: UpdateMemory): Promise<Memory> {
    this.assertFeature();
    const [row] = await this.db
      .update(memoryItems)
      .set({
        ...(patch.content ? { content: patch.content } : {}),
        // Editing a suggestion is an explicit act of approval.
        consentStatus: 'approved',
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(memoryItems.id, id),
          eq(memoryItems.userId, userId),
          inArray(memoryItems.consentStatus, ['suggested', 'approved']),
        ),
      )
      .returning();
    if (!row) throw ApiError.notFound('Memory');
    this.analytics.track('memory_saved', userId, { source: patch.content ? 'edited' : 'approved' });
    return toDto(row);
  }

  async remove(userId: string, id: string): Promise<void> {
    this.assertFeature();
    const res = await this.db
      .delete(memoryItems)
      .where(and(eq(memoryItems.id, id), eq(memoryItems.userId, userId)))
      .returning({ id: memoryItems.id });
    if (res.length === 0) throw ApiError.notFound('Memory');
  }

  async eraseAll(userId: string): Promise<{ deleted: number }> {
    this.assertFeature();
    const res = await this.db
      .delete(memoryItems)
      .where(eq(memoryItems.userId, userId))
      .returning({ id: memoryItems.id });
    return { deleted: res.length };
  }

  /** Approved memories for the prompt — only when the feature and the user's switch are on. */
  async forPrompt(userId: string, memoryEnabled: boolean): Promise<string[]> {
    if (!this.config.env.FEATURE_MEMORY || !memoryEnabled) return [];
    const rows = await this.db
      .select({ content: memoryItems.content })
      .from(memoryItems)
      .where(and(eq(memoryItems.userId, userId), eq(memoryItems.consentStatus, 'approved')))
      .orderBy(asc(memoryItems.createdAt))
      .limit(MAX_MEMORIES);
    return rows.map((r) => r.content);
  }

  /** Records suggestions after a turn; never throws into the chat path. */
  async suggestFrom(
    userId: string,
    memoryEnabled: boolean,
    text: string,
    sourceMessageId: string,
  ): Promise<void> {
    if (!this.config.env.FEATURE_MEMORY || !memoryEnabled) return;
    try {
      const candidates = extractMemorySuggestions(text);
      if (candidates.length === 0) return;
      const existing = await this.db
        .select({ content: memoryItems.content })
        .from(memoryItems)
        .where(eq(memoryItems.userId, userId));
      const seen = new Set(existing.map((e) => e.content.toLowerCase()));
      const fresh = candidates.filter((c) => !seen.has(c.toLowerCase()));
      if (fresh.length === 0 || existing.length + fresh.length > MAX_MEMORIES) return;
      await this.db.insert(memoryItems).values(
        fresh.map((content) => ({
          userId,
          content,
          consentStatus: 'suggested' as const,
          sourceMessageId,
        })),
      );
    } catch (err) {
      this.logger.warn(`Memory suggestion failed: ${(err as Error).message}`);
    }
  }

  private async assertRoom(userId: string) {
    const [row] = await this.db
      .select({ n: count() })
      .from(memoryItems)
      .where(eq(memoryItems.userId, userId));
    if ((row?.n ?? 0) >= MAX_MEMORIES) {
      throw new ApiError(
        ErrorCode.Conflict,
        `You can keep up to ${MAX_MEMORIES} memories. Delete one to add another.`,
      );
    }
  }
}
