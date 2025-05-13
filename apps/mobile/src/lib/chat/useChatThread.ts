import { ErrorCode, type ComedyStyle, type ConversationDetail } from '@bot-friend/shared';
import { useQueryClient } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { ApiClientError, api } from '../api/client';
import { fetchOlderMessages, touchConversation } from '../api/hooks';
import { streamMessage } from '../api/stream';
import {
  chatReducer,
  initialChatState,
  latestSuggestions,
  moodFor,
  type ChatItem,
} from './reducer';

export interface QuotaNotice {
  message: string;
  guest: boolean;
}

/** Owns one conversation's live state: history, streaming, stop, retry and paging. */
export function useChatThread(conversationId: string, detail: ConversationDetail | undefined) {
  const qc = useQueryClient();
  const [state, dispatch] = useReducer(chatReducer, initialChatState);
  const [quota, setQuota] = useState<QuotaNotice | null>(null);
  const [olderCursor, setOlderCursor] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const loadedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!detail || loadedFor.current === detail.id) return;
    loadedFor.current = detail.id;
    dispatch({ type: 'load', messages: detail.messages });
    setOlderCursor(detail.olderMessagesCursor);
  }, [detail]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const run = useCallback(
    async (
      localKey: string,
      content: string,
      idempotencyKey: string,
      comedyStyle?: ComedyStyle,
    ) => {
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        await streamMessage(
          conversationId,
          { content, idempotencyKey, ...(comedyStyle ? { comedyStyle } : {}) },
          { onEvent: (event) => dispatch({ type: 'event', localKey, event }) },
          controller.signal,
        );
        touchConversation(qc, conversationId);
      } catch (err) {
        if (controller.signal.aborted) return;
        if (err instanceof ApiClientError && err.code === ErrorCode.QuotaExceeded) {
          const guest =
            (err.details as { entitlement?: string } | undefined)?.entitlement === 'guest';
          setQuota({ message: err.message, guest });
        }
        const e = err instanceof ApiClientError ? err : null;
        dispatch({
          type: 'sendError',
          localKey,
          message: e?.message ?? 'Couldn’t send. Try again.',
          retryable: e ? e.retryable || e.code === ErrorCode.RateLimited : true,
        });
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
      }
    },
    [conversationId, qc],
  );

  const send = useCallback(
    (content: string, comedyStyle?: ComedyStyle) => {
      if (state.streamingKey) return;
      setQuota(null);
      const localKey = `local-${Crypto.randomUUID()}`;
      const idempotencyKey = Crypto.randomUUID();
      dispatch({ type: 'send', localKey, content, idempotencyKey, now: new Date().toISOString() });
      void run(localKey, content, idempotencyKey, comedyStyle);
    },
    [run, state.streamingKey],
  );

  /** Retry a user message (unsent) or the failed reply that follows it. */
  const retry = useCallback(
    (userItem: ChatItem) => {
      if (!userItem.idempotencyKey && userItem.id) {
        // History loaded from the server: we don't know the original key, so send it as new.
        send(userItem.content);
        return;
      }
      if (!userItem.idempotencyKey) return;
      dispatch({ type: 'retry', localKey: userItem.key });
      void run(userItem.key, userItem.content, userItem.idempotencyKey);
    },
    [run, send],
  );

  /** Ask the server to stop (so it records the reply as cancelled); fall back to dropping the connection. */
  const stop = useCallback(async () => {
    const id = state.streamingKey;
    if (!id) return;
    try {
      const res = await api<{ cancelled: boolean }>(
        'POST',
        `/v1/conversations/${conversationId}/messages/${id}/cancel`,
      );
      if (!res.cancelled) abortRef.current?.abort();
    } catch {
      abortRef.current?.abort();
    }
    if (abortRef.current?.signal.aborted) {
      dispatch({
        type: 'event',
        localKey: '',
        event: {
          type: 'message.failed',
          assistantMessageId: id,
          code: 'cancelled',
          message: 'Stopped.',
          retryable: true,
        },
      });
    }
  }, [conversationId, state.streamingKey]);

  const loadOlder = useCallback(async () => {
    if (!olderCursor || loadingOlder || !detail) return;
    setLoadingOlder(true);
    try {
      const page = await fetchOlderMessages(conversationId, olderCursor);
      dispatch({ type: 'load', messages: [...page.items, ...state.items.flatMap(toMessage)] });
      setOlderCursor(page.nextCursor);
    } catch {
      // keep the cursor; user can scroll again to retry
    } finally {
      setLoadingOlder(false);
    }
  }, [olderCursor, loadingOlder, detail, conversationId, state.items]);

  return {
    state,
    dispatch,
    send,
    retry,
    stop,
    quota,
    loadOlder,
    hasOlder: !!olderCursor,
    loadingOlder,
    streaming: !!state.streamingKey,
    suggestions: latestSuggestions(state),
    mood: moodFor(state),
  };
}

function toMessage(i: ChatItem) {
  if (!i.id || i.status === 'sending' || i.status === 'unsent') return [];
  return [
    {
      id: i.id,
      conversationId: '',
      role: i.role,
      content: i.content,
      status: i.status as never,
      reaction: i.reaction,
      suggestions: i.suggestions,
      supportResources: !!i.supportResources,
      createdAt: i.createdAt,
    },
  ];
}
