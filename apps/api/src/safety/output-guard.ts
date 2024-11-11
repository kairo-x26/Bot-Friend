import type { LocalModeration } from '../ai/local-moderation.js';

const BOUNDARY = /[.!?…]["')\]]?\s+|\n+/g;
const MAX_HOLD_CHARS = 160;

export type GuardResult = { release: string } | { blocked: true };

/**
 * Holds streamed text back until a sentence boundary, checks each sentence
 * with the fast local classifier, then releases it to the client.
 *
 * This bounds what can reach the screen before a check runs to one sentence
 * (or MAX_HOLD_CHARS). The full reply is still moderated by the provider before
 * `message.completed`; if that fails the client replaces everything it showed.
 */
export class OutputGuard {
  private pending = '';
  private released = '';

  constructor(private readonly local: LocalModeration) {}

  push(delta: string): GuardResult {
    this.pending += delta;
    let cut = lastBoundary(this.pending);
    if (cut === 0 && this.pending.length > MAX_HOLD_CHARS) {
      const space = this.pending.lastIndexOf(' ');
      cut = space > 0 ? space + 1 : this.pending.length;
    }
    if (cut === 0) return { release: '' };
    return this.releaseUpTo(cut);
  }

  /** Releases whatever is left at the end of generation. */
  flush(): GuardResult {
    return this.releaseUpTo(this.pending.length);
  }

  get text(): string {
    return this.released + this.pending;
  }

  private releaseUpTo(cut: number): GuardResult {
    const chunk = this.pending.slice(0, cut);
    // Check with a little preceding context so a phrase split across sentences is still caught.
    const window = this.released.slice(-80) + chunk;
    if (this.local.check(window).flagged) return { blocked: true };
    this.pending = this.pending.slice(cut);
    this.released += chunk;
    return { release: chunk };
  }
}

function lastBoundary(text: string): number {
  let last = 0;
  for (const m of text.matchAll(BOUNDARY)) last = m.index + m[0].length;
  return last;
}
