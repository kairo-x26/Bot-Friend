import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { and, eq, inArray, isNull, lt, or } from 'drizzle-orm';
import { AppConfig } from '../config/config.js';
import { DB, type Db } from '../db/database.js';
import { pushDevices, userPreferences, users } from '../db/schema.js';
import { PUSH_PROVIDER, type PushProvider } from './push.provider.js';

/**
 * Gentle, opt-in reminders (BF-024). Rules that keep them non-manipulative:
 * - only users who switched reminders on, at the hour they picked (UTC);
 * - at most one per day, and never to someone who was here in the last 20 hours;
 * - copy is an invitation, never guilt, streaks or "I miss you".
 */
export const REMINDER_LINES = [
  'Got a minute? I have a fresh joke if you want it.',
  'A new would-you-rather just dropped. Totally optional.',
  'Hope today’s going okay. I’m around if you want a laugh.',
  'Your daily pun is ready whenever you are.',
] as const;

@Injectable()
export class ReminderService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger('ReminderService');
  private timer: NodeJS.Timeout | null = null;

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(PUSH_PROVIDER) private readonly push: PushProvider,
    private readonly config: AppConfig,
  ) {}

  onApplicationBootstrap() {
    const minutes = this.config.env.REMINDER_SWEEP_MINUTES;
    if (minutes <= 0 || this.push.name === 'recording') return;
    this.timer = setInterval(
      () => void this.tick().catch((e: Error) => this.logger.error(e.message)),
      minutes * 60_000,
    );
    this.timer.unref();
  }

  onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
  }

  async registerDevice(userId: string, token: string, platform: 'ios' | 'android' | 'web') {
    await this.db
      .insert(pushDevices)
      .values({ userId, token, platform })
      .onConflictDoUpdate({ target: pushDevices.token, set: { userId, platform } });
  }

  async removeDevice(userId: string, token: string) {
    await this.db
      .delete(pushDevices)
      .where(and(eq(pushDevices.userId, userId), eq(pushDevices.token, token)));
  }

  async tick(now = new Date()): Promise<{ sent: number }> {
    const dayAgo = new Date(now.getTime() - 20 * 3600_000);
    const due = await this.db
      .select({ userId: users.id })
      .from(users)
      .innerJoin(userPreferences, eq(userPreferences.userId, users.id))
      .where(
        and(
          eq(users.status, 'active'),
          inArray(users.provider, ['apple', 'google', 'dev']),
          eq(userPreferences.remindersEnabled, true),
          eq(userPreferences.reminderHour, now.getUTCHours()),
          or(isNull(users.lastSeenAt), lt(users.lastSeenAt, dayAgo)),
          or(isNull(userPreferences.lastReminderAt), lt(userPreferences.lastReminderAt, dayAgo)),
        ),
      );
    let sent = 0;
    for (const { userId } of due) {
      const devices = await this.db
        .select()
        .from(pushDevices)
        .where(eq(pushDevices.userId, userId));
      if (devices.length === 0) continue;
      // Mark first so a crash mid-send can never lead to a second reminder today.
      await this.db
        .update(userPreferences)
        .set({ lastReminderAt: now })
        .where(eq(userPreferences.userId, userId));
      const line = REMINDER_LINES[(now.getUTCDate() + sent) % REMINDER_LINES.length]!;
      const { invalidTokens } = await this.push.send(
        devices.map((d) => d.token),
        { title: 'Bot-Friend', body: line, data: { kind: 'reminder' } },
      );
      if (invalidTokens.length)
        await this.db.delete(pushDevices).where(inArray(pushDevices.token, invalidTokens));
      sent++;
    }
    return { sent };
  }
}
