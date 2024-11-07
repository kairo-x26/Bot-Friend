import { encodeSseEvent, type StreamEvent } from '@bot-friend/shared';
import type { FastifyReply } from 'fastify';

export interface EventSink {
  send(event: StreamEvent): void;
  end(): void;
  /** Fires when the client goes away mid-stream. */
  readonly closed: AbortSignal;
}

/** Writes SSE frames straight to the raw socket after taking the reply over from Fastify. */
export function sseSink(reply: FastifyReply): EventSink {
  const controller = new AbortController();
  const raw = reply.raw;
  reply.hijack();

  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(reply.getHeaders())) {
    if (value !== undefined) headers[key] = String(value);
  }
  raw.writeHead(200, {
    ...headers,
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
    // Stop proxies (nginx) from buffering the stream.
    'x-accel-buffering': 'no',
  });
  raw.flushHeaders?.();

  let ended = false;
  raw.on('close', () => {
    if (!ended) controller.abort();
  });
  const heartbeat = setInterval(() => {
    if (!ended) raw.write(': keep-alive\n\n');
  }, 15_000);

  return {
    closed: controller.signal,
    send(event) {
      if (!ended && !raw.writableEnded) raw.write(encodeSseEvent(event));
    },
    end() {
      if (ended) return;
      ended = true;
      clearInterval(heartbeat);
      raw.end();
    },
  };
}
