import {
  GAMES,
  GAME_OPENERS,
  type ComedyStyle,
  type ConversationMode,
  type GameId,
  type GameState,
} from '@bot-friend/shared';
import type { ConversationRow } from '../db/schema.js';

export function isGame(mode: ConversationMode): mode is GameId {
  return mode !== 'chat';
}

export function initialGameState(mode: ConversationMode): GameState | null {
  if (!isGame(mode)) return null;
  return {
    round: 0,
    maxRounds: GAMES[mode].maxRounds,
    active: true,
    ...(mode === 'joke_battle' ? { ratings: [] } : {}),
  };
}

export function opener(mode: ConversationMode, style: ComedyStyle): string | null {
  return isGame(mode) ? GAME_OPENERS[mode][style] : null;
}

export function readGameState(row: Pick<ConversationRow, 'gameState'>): GameState | null {
  const s = row.gameState as Partial<GameState> | null;
  if (!s || typeof s.round !== 'number') return null;
  return {
    round: s.round,
    maxRounds: s.maxRounds ?? null,
    active: Boolean(s.active),
    ratings: s.ratings,
  };
}

/** The mode the prompt should use: a finished or abandoned game is just a chat. */
export function effectiveMode(row: Pick<ConversationRow, 'mode' | 'gameState'>): ConversationMode {
  const state = readGameState(row);
  return isGame(row.mode) && state?.active ? row.mode : 'chat';
}

const RATING_RE = /\b(10|[0-9])\s*\/\s*10\b/;

/** Moves the game forward after a completed reply. */
export function advanceGame(mode: ConversationMode, state: GameState, reply: string): GameState {
  const round = state.round + 1;
  const next: GameState = { ...state, round };
  if (mode === 'joke_battle') {
    const m = RATING_RE.exec(reply);
    if (m) next.ratings = [...(state.ratings ?? []), Number(m[1])];
  }
  if (state.maxRounds !== null && round >= state.maxRounds) next.active = false;
  return next;
}

export function isFinalRound(state: GameState | null): boolean {
  return Boolean(state?.active && state.maxRounds !== null && state.round + 1 >= state.maxRounds);
}
