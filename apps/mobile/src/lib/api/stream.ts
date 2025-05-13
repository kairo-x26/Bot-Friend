import {
  ErrorCode,
  SseParser,
  TERMINAL_EVENTS,
  type SendMessage,
  type StreamEvent,
} from '@bot-friend/shared';
import { fetch as expoFetch } from 'expo/fetch';
import { config } from '../config';
import { ApiClientError, OFFLINE_MESSAGE, authHeaders, toApiError } from './client';

export interface StreamHandlers {
  onEvent(event: StreamEvent): void;
}

/**
 * Sends a message and reads the SSE reply incrementally. Resolves once a
 * terminal event arrives. Throws ApiClientError for HTTP errors before the
 * stream opens, and for connections that drop without a terminal event
 * (callers then offer retry with the same idempotency key).
 */
export async function streamMessage(
  conversationId: string,
  body: SendMessage,
  handlers: StreamHandlers,
  signal?: AbortSignal,
): Promise<StreamEvent> {
  let res: Awaited<ReturnType<typeof expoFetch>>;
  try {
    res = await expoFetch(`${config.apiUrl}/v1/conversations/${conversationId}/messages/stream`, {
      method: 'POST',
      signal,
      headers: {
        accept: 'text/event-stream',
        'content-type': 'application/json',
        ...authHeaders(),
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    if (signal?.aborted) throw err;
    throw new ApiClientError(0, ErrorCode.ProviderUnavailable, OFFLINE_MESSAGE);
  }
  if (!res.ok) throw await toApiError(res as unknown as Response);
  if (!res.body)
    throw new ApiClientError(0, ErrorCode.Internal, 'Streaming is not supported here.');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const parser = new SseParser();
  let terminal: StreamEvent | null = null;
  try {
    while (!terminal) {
      const { done, value } = await reader.read();
      if (done) break;
      for (const event of parser.push(decoder.decode(value, { stream: true }))) {
        handlers.onEvent(event);
        if (TERMINAL_EVENTS.has(event.type)) terminal = event;
      }
    }
  } catch (err) {
    if (signal?.aborted) throw err;
  } finally {
    reader.cancel().catch(() => undefined);
  }
  if (!terminal) {
    if (signal?.aborted) throw Object.assign(new Error('Aborted'), { name: 'AbortError' });
    throw new ApiClientError(
      0,
      ErrorCode.ProviderUnavailable,
      'The connection dropped before the reply finished.',
    );
  }
  return terminal;
}
