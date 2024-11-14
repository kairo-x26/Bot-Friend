import { Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export interface RateLimitStore {
  /** Increments the counter for `key` in the current window and returns the new count. */
  increment(key: string, windowMs: number): Promise<{ count: number; resetAt: number }>;
}

export class MemoryRateLimitStore implements RateLimitStore {
  private readonly windows = new Map<string, { count: number; resetAt: number }>();
  private lastSweep = Date.now();

  async increment(key: string, windowMs: number) {
    const now = Date.now();
    if (now - this.lastSweep > 60_000) this.sweep(now);
    const current = this.windows.get(key);
    if (!current || current.resetAt <= now) {
      const fresh = { count: 1, resetAt: now + windowMs };
      this.windows.set(key, fresh);
      return fresh;
    }
    current.count++;
    return current;
  }

  private sweep(now: number) {
    this.lastSweep = now;
    for (const [key, value] of this.windows) if (value.resetAt <= now) this.windows.delete(key);
  }
}

/** Shared counters for multi-instance deployments. */
export class RedisRateLimitStore implements RateLimitStore {
  constructor(private readonly redis: Redis) {}

  async increment(key: string, windowMs: number) {
    const redisKey = `rl:${key}`;
    const results = await this.redis.multi().incr(redisKey).pexpire(redisKey, windowMs, 'NX').pttl(redisKey).exec();
    const count = Number(results?.[0]?.[1] ?? 1);
    const ttl = Number(results?.[2]?.[1] ?? windowMs);
    return { count, resetAt: Date.now() + (ttl > 0 ? ttl : windowMs) };
  }
}

/** Fixed-window limiter. Fails open if the store is unreachable so a Redis blip doesn't stop chat. */
export class RateLimiter {
  private readonly logger = new Logger('RateLimiter');

  constructor(private readonly store: RateLimitStore) {}

  async hit(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
    try {
      const { count, resetAt } = await this.store.increment(key, windowMs);
      return {
        allowed: count <= limit,
        remaining: Math.max(0, limit - count),
        retryAfterSeconds: Math.max(1, Math.ceil((resetAt - Date.now()) / 1000)),
      };
    } catch (err) {
      this.logger.warn(`Rate limit store unavailable: ${(err as Error).message}`);
      return { allowed: true, remaining: limit, retryAfterSeconds: 0 };
    }
  }
}
