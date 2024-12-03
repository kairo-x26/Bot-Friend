import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, lt, or } from 'drizzle-orm';
import type {
  ConversationDetail,
  ConversationPage,
  CreateConversation,
  MessagePage,
  PaginationQuery,
} from '@bot-friend/shared';
import { AnalyticsService } from '../audit/audit.service.js';
import { ApiError } from '../common/api-error.js';
import { decodeCursor, encodeCursor } from '../common/cursor.js';
import { DB, type Db, type DbOrTx } from '../db/database.js';
import { conversations, messages, type ConversationRow } from '../db/schema.js';
import { initialGameState, isGame, opener } from '../games/game-engine.js';
import { UsersService } from '../users/users.service.js';
import { MODE_TITLES, preview, toConversationDto, toMessageDto } from './conversations.mapper.js';

export const DEFAULT_BOT_PROFILE = 'bot-friend';
const VISIBLE_ROLES = ['user', 'assistant'] as const;

@Injectable()
export class ConversationsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly users: UsersService,
    private readonly analytics: AnalyticsService,
  ) {}

  async create(userId: string, input: CreateConversation & { mode: ConversationRow['mode'] }) {
    const prefs = await this.users.preferences(userId);
    if (input.mode === 'roast_me' && !prefs.roastOptIn) {
      throw ApiError.forbidden('Turn on roasts in Customize before starting Roast Me.');
    }
    const intro = opener(input.mode, prefs.comedyStyle);
    const row = await this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(conversations)
        .values({
          userId,
          botProfileId: DEFAULT_BOT_PROFILE,
          title: input.title ?? MODE_TITLES[input.mode],
          titleIsAuto: !input.title,
          mode: input.mode,
          comedyStyle: prefs.comedyStyle,
          gameState: initialGameState(input.mode),
          lastMessagePreview: intro ? preview(intro) : null,
        })
        .returning();
      // Games open with Bot-Friend's first move so the user knows how to play.
      if (intro) await this.postOpener(tx, row!, intro);
      return row!;
    });
    if (isGame(input.mode)) this.analytics.track('game_started', userId, { mode: input.mode });
    return row;
  }

  /** End a running game (back to plain chat) or start it over. */
  async gameAction(userId: string, id: string, action: 'end' | 'restart') {
    const convo = await this.getOwned(userId, id);
    if (!isGame(convo.mode)) throw ApiError.forbidden('This conversation is not a game');
    const prefs = await this.users.preferences(userId);
    const row = await this.db.transaction(async (tx) => {
      const state = action === 'restart' ? initialGameState(convo.mode) : { ...(convo.gameState ?? {}), active: false };
      const [row] = await tx
        .update(conversations)
        .set({ gameState: state, updatedAt: new Date() })
        .where(eq(conversations.id, id))
        .returning();
      if (action === 'restart') await this.postOpener(tx, row!, opener(convo.mode, prefs.comedyStyle)!);
      return row!;
    });
    return toConversationDto(row);
  }

  private async postOpener(tx: DbOrTx, convo: ConversationRow, text: string) {
    await tx.insert(messages).values({
      conversationId: convo.id,
      userId: convo.userId,
      role: 'assistant',
      content: text,
      status: 'completed',
      promptVersion: 'opener',
    });
  }

  /** Loads a conversation only if `userId` owns it. Others get the same 404 as a missing id. */
  async getOwned(userId: string, id: string, db: DbOrTx = this.db): Promise<ConversationRow> {
    const [row] = await db
      .select()
      .from(conversations)
      .where(and(eq(conversations.id, id), eq(conversations.userId, userId)))
      .limit(1);
    if (!row) throw ApiError.notFound('Conversation');
    return row;
  }

  async list(userId: string, { cursor, limit }: PaginationQuery): Promise<ConversationPage> {
    const after = decodeCursor(cursor);
    const rows = await this.db
      .select()
      .from(conversations)
      .where(
        and(
          eq(conversations.userId, userId),
          after
            ? or(
                lt(conversations.updatedAt, after.at),
                and(eq(conversations.updatedAt, after.at), lt(conversations.id, after.id)),
              )
            : undefined,
        ),
      )
      .orderBy(desc(conversations.updatedAt), desc(conversations.id))
      .limit(limit + 1);
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return {
      items: page.map(toConversationDto),
      nextCursor: rows.length > limit && last ? encodeCursor(last.updatedAt, last.id) : null,
    };
  }

  async detail(userId: string, id: string): Promise<ConversationDetail> {
    const convo = await this.getOwned(userId, id);
    const page = await this.messages(userId, id, { limit: 30 });
    return { ...toConversationDto(convo), messages: page.items };
  }

  /**
   * Messages newest-page-first. Items inside a page are chronological;
   * `nextCursor` fetches the page of older messages.
   */
  async messages(userId: string, conversationId: string, { cursor, limit }: PaginationQuery): Promise<MessagePage> {
    await this.getOwned(userId, conversationId);
    const before = decodeCursor(cursor);
    const rows = await this.db
      .select()
      .from(messages)
      .where(
        and(
          eq(messages.conversationId, conversationId),
          eq(messages.userId, userId),
          inArray(messages.role, [...VISIBLE_ROLES]),
          before
            ? or(lt(messages.createdAt, before.at), and(eq(messages.createdAt, before.at), lt(messages.id, before.id)))
            : undefined,
        ),
      )
      .orderBy(desc(messages.createdAt), desc(messages.id))
      .limit(limit + 1);
    const page = rows.slice(0, limit);
    const oldest = page.at(-1);
    return {
      items: page.reverse().map(toMessageDto),
      nextCursor: rows.length > limit && oldest ? encodeCursor(oldest.createdAt, oldest.id) : null,
    };
  }

  async rename(userId: string, id: string, title: string) {
    await this.getOwned(userId, id);
    const [row] = await this.db
      .update(conversations)
      .set({ title, titleIsAuto: false })
      .where(and(eq(conversations.id, id), eq(conversations.userId, userId)))
      .returning();
    return toConversationDto(row!);
  }

  async remove(userId: string, id: string): Promise<void> {
    const deleted = await this.db
      .delete(conversations)
      .where(and(eq(conversations.id, id), eq(conversations.userId, userId)))
      .returning({ id: conversations.id });
    if (deleted.length === 0) throw ApiError.notFound('Conversation');
  }

  /** Recent completed turns for prompt context, oldest first. */
  async history(conversationId: string, limit: number, db: DbOrTx = this.db) {
    const rows = await db
      .select()
      .from(messages)
      .where(
        and(
          eq(messages.conversationId, conversationId),
          inArray(messages.role, [...VISIBLE_ROLES]),
          eq(messages.status, 'completed'),
        ),
      )
      .orderBy(desc(messages.createdAt), desc(messages.id))
      .limit(limit);
    return rows.reverse();
  }

}
