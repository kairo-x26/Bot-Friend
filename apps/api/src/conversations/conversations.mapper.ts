import type { Conversation, Message } from '@bot-friend/shared';
import type { ConversationRow, MessageRow } from '../db/schema.js';
import { readGameState } from '../games/game-engine.js';

export function toConversationDto(row: ConversationRow): Conversation {
  const game = readGameState(row);
  return {
    id: row.id,
    title: row.title,
    mode: row.mode,
    game: game ? { round: game.round, maxRounds: game.maxRounds, active: game.active } : null,
    comedyStyle: row.comedyStyle,
    lastMessagePreview: row.lastMessagePreview,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toMessageDto(row: MessageRow): Message {
  return {
    id: row.id,
    conversationId: row.conversationId,
    role: row.role,
    content: row.content,
    status: row.status,
    reaction: row.reaction,
    suggestions: row.suggestions ?? [],
    supportResources: row.errorCode === 'self_harm',
    attachments: row.attachments ?? [],
    createdAt: row.createdAt.toISOString(),
  };
}

export const MODE_TITLES: Record<ConversationRow['mode'], string> = {
  chat: 'New chat',
  joke_battle: 'Joke Battle',
  roast_me: 'Roast Me',
  would_you_rather: 'Would You Rather',
  story_builder: 'Story Builder',
  silly_quiz: 'Silly Quiz',
};

/** Short single-line preview for conversation lists. */
export function preview(text: string, max = 90): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
}
