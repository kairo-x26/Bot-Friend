import type { Message, StreamEvent } from '@bot-friend/shared';
import { chatReducer, initialChatState, latestSuggestions, moodFor, type ChatState } from '../reducer';

const now = '2025-01-01T10:00:00.000Z';
const A = '11111111-1111-4111-8111-111111111111';
const U = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';

const userMsg: Message = {
  id: U,
  conversationId: C,
  role: 'user',
  content: 'hi',
  status: 'completed',
  reaction: null,
  suggestions: [],
  supportResources: false,
  createdAt: now,
};

function run(events: StreamEvent[], state: ChatState = initialChatState) {
  let s = chatReducer(state, { type: 'send', localKey: 'local-1', content: 'hi', idempotencyKey: 'idem-1', now });
  for (const event of events) s = chatReducer(s, { type: 'event', localKey: 'local-1', event });
  return s;
}

const started: StreamEvent = { type: 'message.started', userMessage: userMsg, assistantMessageId: A, replay: false };
const delta = (seq: number, text: string): StreamEvent => ({ type: 'message.delta', assistantMessageId: A, seq, text });

describe('chatReducer streaming', () => {
  it('adds an optimistic user message, then a streaming draft', () => {
    const s = run([started]);
    expect(s.items.map((i) => [i.role, i.status])).toEqual([
      ['user', 'completed'],
      ['assistant', 'streaming'],
    ]);
    expect(s.items[0]!.key).toBe('local-1');
    expect(s.items[0]!.id).toBe(U);
    expect(s.streamingKey).toBe(A);
    expect(moodFor(s)).toBe('thinking');
  });

  it('appends deltas in order and ignores duplicates or gaps', () => {
    const s = run([started, delta(0, 'Hel'), delta(0, 'Hel'), delta(2, 'XX'), delta(1, 'lo')]);
    expect(s.items[1]!.content).toBe('Hello');
  });

  it('replaces the provisional text with the completed message', () => {
    const s = run([
      started,
      delta(0, 'partial'),
      {
        type: 'message.completed',
        message: { ...userMsg, id: A, role: 'assistant', content: 'Final text 😂', suggestions: ['a', 'b', 'c'] },
      },
    ]);
    expect(s.items[1]).toMatchObject({ content: 'Final text 😂', status: 'completed' });
    expect(s.streamingKey).toBeNull();
    expect(latestSuggestions(s)).toEqual(['a', 'b', 'c']);
    expect(moodFor(s)).toBe('laughing');
  });

  it('swaps in the safe replacement when output is blocked', () => {
    const s = run([
      started,
      delta(0, 'something'),
      { type: 'message.blocked', assistantMessageId: A, stage: 'output', replacement: 'Scrapped it.', supportResources: false },
    ]);
    expect(s.items[1]).toMatchObject({ content: 'Scrapped it.', status: 'blocked' });
    expect(latestSuggestions(s)).toEqual([]);
  });

  it('shows support resources for input safety blocks', () => {
    const s = run([
      started,
      { type: 'message.blocked', assistantMessageId: A, stage: 'input', replacement: 'Support text', supportResources: true },
    ]);
    expect(s.items[0]!.status).toBe('blocked');
    expect(s.items[1]!.supportResources).toBe(true);
    expect(moodFor(s)).toBe('caring');
  });

  it('marks cancelled vs failed replies', () => {
    const cancelled = run([started, { type: 'message.failed', assistantMessageId: A, code: 'cancelled', message: 'Stopped.', retryable: true }]);
    expect(cancelled.items[1]!.status).toBe('cancelled');
    const failed = run([started, { type: 'message.failed', assistantMessageId: A, code: 'provider_unavailable', message: 'Try again', retryable: true }]);
    expect(failed.items[1]).toMatchObject({ status: 'failed', retryable: true });
  });
});

describe('chatReducer retry', () => {
  it('drops a partial reply when the connection fails and keeps the message for retry', () => {
    let s = run([started, delta(0, 'half a')]);
    s = chatReducer(s, { type: 'sendError', localKey: 'local-1', message: 'Connection dropped', retryable: true });
    expect(s.items).toHaveLength(1);
    expect(s.items[0]).toMatchObject({ status: 'unsent', error: 'Connection dropped', idempotencyKey: 'idem-1' });
    expect(s.streamingKey).toBeNull();
  });

  it('retry removes the failed reply and resends without duplicating the user message', () => {
    let s = run([started, { type: 'message.failed', assistantMessageId: A, code: 'provider_unavailable', message: 'x', retryable: true }]);
    s = chatReducer(s, { type: 'retry', localKey: 'local-1' });
    expect(s.items).toHaveLength(1);
    expect(s.items[0]!.status).toBe('sending');
    const A2 = '44444444-4444-4444-8444-444444444444';
    s = chatReducer(s, { type: 'event', localKey: 'local-1', event: { ...started, assistantMessageId: A2 } as StreamEvent });
    expect(s.items.filter((i) => i.role === 'user')).toHaveLength(1);
    expect(s.items[1]!.key).toBe(A2);
  });

  it('a replayed turn does not duplicate a message already loaded from history', () => {
    let s = chatReducer(initialChatState, { type: 'load', messages: [userMsg] });
    s = chatReducer(s, { type: 'send', localKey: 'local-1', content: 'hi', idempotencyKey: 'idem-1', now });
    s = chatReducer(s, { type: 'event', localKey: 'local-1', event: { ...started, replay: true } as StreamEvent });
    expect(s.items.filter((i) => i.id === U)).toHaveLength(1);
  });
});

describe('chatReducer load', () => {
  it('keeps unsent local messages when history reloads', () => {
    let s = chatReducer(initialChatState, { type: 'send', localKey: 'local-9', content: 'pending', idempotencyKey: 'k', now });
    s = chatReducer(s, { type: 'sendError', localKey: 'local-9', message: 'offline', retryable: true });
    s = chatReducer(s, { type: 'load', messages: [userMsg] });
    expect(s.items.map((i) => i.key)).toEqual([U, 'local-9']);
  });

  it('applies reactions by server id', () => {
    let s = chatReducer(initialChatState, { type: 'load', messages: [{ ...userMsg, id: A, role: 'assistant' }] });
    s = chatReducer(s, { type: 'react', id: A, reaction: 'laugh' });
    expect(s.items[0]!.reaction).toBe('laugh');
  });
});
