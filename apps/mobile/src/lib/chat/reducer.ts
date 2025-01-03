import type { Message, Reaction, StreamEvent } from '@bot-friend/shared';

export type ItemStatus = Message['status'] | 'sending' | 'unsent';

export interface ChatItem {
  /** Stable key for list rendering; survives the local → server id swap. */
  key: string;
  id: string | null;
  role: 'user' | 'assistant';
  content: string;
  status: ItemStatus;
  suggestions: string[];
  reaction: Reaction | null;
  createdAt: string;
  /** User messages: reused on retry so the server never duplicates them. */
  idempotencyKey?: string;
  /** Assistant replies that are a safety response with support resources. */
  supportResources?: boolean;
  error?: string;
  retryable?: boolean;
}

export interface ChatState {
  items: ChatItem[];
  /** Key of the assistant item currently streaming, if any. */
  streamingKey: string | null;
  nextSeq: number;
}

export type ChatAction =
  | { type: 'load'; messages: Message[] }
  | { type: 'send'; localKey: string; content: string; idempotencyKey: string; now: string }
  | { type: 'event'; localKey: string; event: StreamEvent }
  | { type: 'sendError'; localKey: string; message: string; retryable: boolean }
  | { type: 'retry'; localKey: string }
  | { type: 'react'; id: string; reaction: Reaction | null }
  | { type: 'remove'; key: string };

export const initialChatState: ChatState = { items: [], streamingKey: null, nextSeq: 0 };

const fromServer = (m: Message): ChatItem => ({
  key: m.id,
  id: m.id,
  role: m.role === 'user' ? 'user' : 'assistant',
  content: m.content,
  status: m.status,
  suggestions: m.suggestions,
  reaction: m.reaction,
  createdAt: m.createdAt,
  supportResources: m.supportResources,
});

function replaceItem(items: ChatItem[], key: string, patch: Partial<ChatItem>): ChatItem[] {
  return items.map((i) => (i.key === key ? { ...i, ...patch } : i));
}

/** The assistant item that answers the user item `userKey`, i.e. the next assistant item after it. */
function replyKeyFor(items: ChatItem[], userKey: string): string | null {
  const idx = items.findIndex((i) => i.key === userKey);
  const next = items[idx + 1];
  return idx >= 0 && next?.role === 'assistant' ? next.key : null;
}

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'load': {
      // Server history wins, but keep local messages the server hasn't seen yet.
      const serverIds = new Set(action.messages.map((m) => m.id));
      const pending = state.items.filter((i) => !i.id || !serverIds.has(i.id)).filter((i) => i.status === 'unsent' || i.status === 'sending' || i.status === 'streaming');
      return { ...state, items: [...action.messages.map(fromServer), ...pending] };
    }

    case 'send':
      return {
        ...state,
        items: [
          ...state.items,
          {
            key: action.localKey,
            id: null,
            role: 'user',
            content: action.content,
            status: 'sending',
            suggestions: [],
            reaction: null,
            createdAt: action.now,
            idempotencyKey: action.idempotencyKey,
          },
        ],
      };

    case 'retry': {
      const replyKey = replyKeyFor(state.items, action.localKey);
      const items = state.items.filter((i) => i.key !== replyKey);
      return { ...state, items: replaceItem(items, action.localKey, { status: 'sending', error: undefined, retryable: undefined }) };
    }

    case 'sendError': {
      const replyKey = replyKeyFor(state.items, action.localKey);
      // A dropped stream: the partial reply is not authoritative, so discard it.
      const items = replyKey ? state.items.filter((i) => i.key !== replyKey) : state.items;
      return {
        ...state,
        streamingKey: null,
        items: replaceItem(items, action.localKey, { status: 'unsent', error: action.message, retryable: action.retryable }),
      };
    }

    case 'react':
      return { ...state, items: state.items.map((i) => (i.id === action.id ? { ...i, reaction: action.reaction } : i)) };

    case 'remove':
      return { ...state, items: state.items.filter((i) => i.key !== action.key) };

    case 'event':
      return applyEvent(state, action.localKey, action.event);
  }
}

function applyEvent(state: ChatState, localKey: string, event: StreamEvent): ChatState {
  switch (event.type) {
    case 'message.started': {
      const u = event.userMessage;
      let items = replaceItem(state.items, localKey, { id: u.id, status: u.status, createdAt: u.createdAt, error: undefined });
      // Same server message can already be on screen (replay after reload); drop the duplicate.
      items = items.filter((i) => i.key === localKey || i.id !== u.id);
      const assistantKey = event.assistantMessageId;
      items = items.filter((i) => i.key !== assistantKey);
      const idx = items.findIndex((i) => i.key === localKey);
      const draft: ChatItem = {
        key: assistantKey,
        id: assistantKey,
        role: 'assistant',
        content: '',
        status: 'streaming',
        suggestions: [],
        reaction: null,
        createdAt: u.createdAt,
      };
      items = [...items.slice(0, idx + 1), draft, ...items.slice(idx + 1)];
      return { items, streamingKey: assistantKey, nextSeq: 0 };
    }

    case 'message.delta': {
      if (event.assistantMessageId !== state.streamingKey) return state;
      // Duplicate or out-of-order frames are ignored; seq must be the next one expected.
      if (event.seq !== state.nextSeq) return state;
      const items = state.items.map((i) => (i.key === event.assistantMessageId ? { ...i, content: i.content + event.text } : i));
      return { ...state, items, nextSeq: state.nextSeq + 1 };
    }

    case 'message.completed': {
      const m = event.message;
      const exists = state.items.some((i) => i.key === m.id);
      const final: Partial<ChatItem> = { content: m.content, status: 'completed', suggestions: m.suggestions, reaction: m.reaction, createdAt: m.createdAt };
      const items = exists ? replaceItem(state.items, m.id, final) : [...state.items, { ...fromServer(m) }];
      return { ...state, items, streamingKey: null };
    }

    case 'message.blocked': {
      const key = event.assistantMessageId;
      const patch: Partial<ChatItem> = { content: event.replacement, status: 'blocked', supportResources: event.supportResources, suggestions: [] };
      let items = state.items.some((i) => i.key === key)
        ? replaceItem(state.items, key, patch)
        : [...state.items, { key, id: key, role: 'assistant' as const, reaction: null, createdAt: new Date().toISOString(), ...patch, content: event.replacement, status: 'blocked' as const, suggestions: [] }];
      if (event.stage === 'input') items = replaceItem(items, localKey, { status: 'blocked' });
      return { ...state, items, streamingKey: null };
    }

    case 'message.failed': {
      const cancelled = event.code === 'cancelled';
      const items = replaceItem(state.items, event.assistantMessageId, {
        status: cancelled ? 'cancelled' : 'failed',
        error: event.message,
        retryable: event.retryable,
      });
      return { ...state, items, streamingKey: null };
    }
  }
}

/** Suggestion chips come from the latest completed assistant reply only. */
export function latestSuggestions(state: ChatState): string[] {
  const last = state.items.at(-1);
  return last?.role === 'assistant' && last.status === 'completed' ? last.suggestions : [];
}

/** The mascot's mood follows the conversation. */
export type MascotMood = 'idle' | 'happy' | 'laughing' | 'thinking' | 'surprised' | 'caring' | 'sleepy';

export function moodFor(state: ChatState): MascotMood {
  if (state.streamingKey) return 'thinking';
  const last = [...state.items].reverse().find((i) => i.role === 'assistant');
  if (!last) return 'happy';
  if (last.status === 'blocked') return last.supportResources ? 'caring' : 'surprised';
  if (last.status === 'failed') return 'surprised';
  if (/😂|🤣|lol|haha|😆/i.test(last.content)) return 'laughing';
  if (/glad you told me|sounds hard|sorry/i.test(last.content)) return 'caring';
  return 'happy';
}
