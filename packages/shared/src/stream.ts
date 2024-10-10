import { z } from 'zod';
import { errorCodeSchema } from './errors.js';
import { messageSchema } from './domain.js';

/**
 * Server-sent events emitted by POST /v1/conversations/{id}/messages/stream.
 * Exactly one terminal event (completed | blocked | failed) ends every stream.
 * Clients must treat accumulated deltas as provisional until `message.completed`.
 */
export const streamEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('message.started'),
    userMessage: messageSchema,
    assistantMessageId: z.string().uuid(),
    /** True when this is a replay of an already-processed idempotency key. */
    replay: z.boolean(),
  }),
  z.object({
    type: z.literal('message.delta'),
    assistantMessageId: z.string().uuid(),
    /** Monotonic sequence number starting at 0, lets clients drop duplicates. */
    seq: z.number().int().nonnegative(),
    text: z.string(),
  }),
  z.object({
    type: z.literal('message.completed'),
    message: messageSchema,
  }),
  z.object({
    type: z.literal('message.blocked'),
    assistantMessageId: z.string().uuid(),
    /** Who was blocked: the user's input or the generated reply. */
    stage: z.enum(['input', 'output']),
    /** Safe replacement text the client should show instead of any partial text. */
    replacement: z.string(),
    supportResources: z.boolean(),
  }),
  z.object({
    type: z.literal('message.failed'),
    assistantMessageId: z.string().uuid(),
    code: errorCodeSchema,
    message: z.string(),
    retryable: z.boolean(),
  }),
]);
export type StreamEvent = z.infer<typeof streamEventSchema>;
export type StreamEventType = StreamEvent['type'];

export const TERMINAL_EVENTS: ReadonlySet<StreamEventType> = new Set([
  'message.completed',
  'message.blocked',
  'message.failed',
]);

/** Serialize one event in SSE wire format. */
export function encodeSseEvent(event: StreamEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

/**
 * Incremental SSE parser. Feed it arbitrary chunks; it returns every complete
 * event found so far and keeps partial frames buffered.
 */
export class SseParser {
  private buffer = '';

  push(chunk: string): StreamEvent[] {
    this.buffer += chunk.replace(/\r\n/g, '\n');
    const events: StreamEvent[] = [];
    let idx: number;
    while ((idx = this.buffer.indexOf('\n\n')) !== -1) {
      const frame = this.buffer.slice(0, idx);
      this.buffer = this.buffer.slice(idx + 2);
      const data = frame
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).replace(/^ /, ''))
        .join('\n');
      if (!data) continue;
      try {
        const parsed = streamEventSchema.safeParse(JSON.parse(data));
        if (parsed.success) events.push(parsed.data);
      } catch {
        // ignore malformed frames; the terminal event decides the outcome
      }
    }
    return events;
  }
}
