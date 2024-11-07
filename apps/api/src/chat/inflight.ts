import { Injectable } from '@nestjs/common';

/** Tracks generations running on this instance so a stop request can abort them. */
@Injectable()
export class InflightRegistry {
  private readonly running = new Map<string, { userId: string; controller: AbortController }>();

  start(assistantMessageId: string, userId: string): AbortController {
    const controller = new AbortController();
    this.running.set(assistantMessageId, { userId, controller });
    return controller;
  }

  finish(assistantMessageId: string) {
    this.running.delete(assistantMessageId);
  }

  has(assistantMessageId: string) {
    return this.running.has(assistantMessageId);
  }

  /** Returns false when nothing owned by this user is running under that id. */
  cancel(assistantMessageId: string, userId: string): boolean {
    const entry = this.running.get(assistantMessageId);
    if (!entry || entry.userId !== userId) return false;
    entry.controller.abort(new Error('cancelled'));
    return true;
  }
}
