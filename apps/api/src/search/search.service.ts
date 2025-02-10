import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, ilike, inArray } from 'drizzle-orm';
import type { SearchResult } from '@bot-friend/shared';
import { DB, type Db } from '../db/database.js';
import { conversations, messages } from '../db/schema.js';

/** Escape LIKE wildcards so user input is matched literally. */
export function escapeLike(q: string): string {
  return q.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Excerpt of ~120 chars around the first match with the match wrapped in [ ]. */
export function snippet(text: string, q: string, radius = 50): string {
  const flat = text.replace(/\s+/g, ' ');
  const idx = flat.toLowerCase().indexOf(q.toLowerCase());
  if (idx < 0) return flat.slice(0, radius * 2);
  const start = Math.max(0, idx - radius);
  const end = Math.min(flat.length, idx + q.length + radius);
  return `${start > 0 ? '…' : ''}${flat.slice(start, idx)}[${flat.slice(idx, idx + q.length)}]${flat.slice(idx + q.length, end)}${end < flat.length ? '…' : ''}`;
}

/**
 * Case-insensitive search over the user's own completed messages (BF-021).
 * A pg_trgm GIN index on messages.content is the next step if this gets slow.
 */
@Injectable()
export class SearchService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async search(userId: string, q: string, limit: number): Promise<SearchResult> {
    const rows = await this.db
      .select({
        conversationId: messages.conversationId,
        conversationTitle: conversations.title,
        mode: conversations.mode,
        messageId: messages.id,
        role: messages.role,
        content: messages.content,
        createdAt: messages.createdAt,
      })
      .from(messages)
      .innerJoin(conversations, eq(conversations.id, messages.conversationId))
      .where(
        and(
          eq(messages.userId, userId),
          eq(conversations.userId, userId),
          eq(messages.status, 'completed'),
          inArray(messages.role, ['user', 'assistant']),
          ilike(messages.content, `%${escapeLike(q)}%`),
        ),
      )
      .orderBy(desc(messages.createdAt))
      .limit(limit);
    return {
      items: rows.map((r) => ({
        conversationId: r.conversationId,
        conversationTitle: r.conversationTitle,
        mode: r.mode,
        messageId: r.messageId,
        role: r.role as 'user' | 'assistant',
        snippet: snippet(r.content, q),
        createdAt: r.createdAt.toISOString(),
      })),
    };
  }
}
