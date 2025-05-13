import { describe, expect, it } from 'vitest';
import { SseParser, encodeSseEvent, type StreamEvent } from '../src/index.js';

const id = '7d1c5d8e-3f0a-4c55-9a3b-5d0e2b9f8a11';

describe('SseParser', () => {
  it('round-trips encoded events', () => {
    const ev: StreamEvent = {
      type: 'message.delta',
      assistantMessageId: id,
      seq: 0,
      text: 'hi 👋',
    };
    expect(new SseParser().push(encodeSseEvent(ev))).toEqual([ev]);
  });

  it('handles frames split across arbitrary chunk boundaries', () => {
    const events: StreamEvent[] = [0, 1, 2].map((seq) => ({
      type: 'message.delta',
      assistantMessageId: id,
      seq,
      text: `part ${seq}\nwith newline`,
    }));
    const wire = events.map(encodeSseEvent).join('');
    const parser = new SseParser();
    const out: StreamEvent[] = [];
    for (let i = 0; i < wire.length; i += 7) out.push(...parser.push(wire.slice(i, i + 7)));
    expect(out).toEqual(events);
  });

  it('accepts CRLF line endings and skips comments and junk', () => {
    const ev: StreamEvent = { type: 'message.delta', assistantMessageId: id, seq: 3, text: 'x' };
    const wire =
      `: keep-alive\r\n\r\ndata: not json\r\n\r\n` + encodeSseEvent(ev).replace(/\n/g, '\r\n');
    expect(new SseParser().push(wire)).toEqual([ev]);
  });

  it('drops events that do not match the contract', () => {
    expect(new SseParser().push('data: {"type":"message.delta"}\n\n')).toEqual([]);
  });
});
