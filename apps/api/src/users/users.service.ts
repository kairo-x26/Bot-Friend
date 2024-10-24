import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { MeResponse, Preferences, UpdatePreferences } from '@bot-friend/shared';
import { DB, type Db } from '../db/database.js';
import { userPreferences, type UserRow } from '../db/schema.js';
import { toPreferencesDto, toUserDto } from './users.mapper.js';

@Injectable()
export class UsersService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async preferences(userId: string): Promise<Preferences> {
    const [row] = await this.db.select().from(userPreferences).where(eq(userPreferences.userId, userId));
    if (row) return toPreferencesDto(row);
    // Self-heal accounts created before preferences existed.
    const [created] = await this.db.insert(userPreferences).values({ userId }).onConflictDoNothing().returning();
    if (created) return toPreferencesDto(created);
    return this.preferences(userId);
  }

  async me(user: UserRow): Promise<MeResponse> {
    return { user: toUserDto(user), preferences: await this.preferences(user.id) };
  }

  async updatePreferences(userId: string, patch: UpdatePreferences): Promise<Preferences> {
    await this.preferences(userId);
    const values: Partial<typeof userPreferences.$inferInsert> = { ...patch, updatedAt: new Date() };
    if (patch.humorBoundaries) values.humorBoundaries = [...new Set(patch.humorBoundaries)];
    const [row] = await this.db
      .update(userPreferences)
      .set(values)
      .where(eq(userPreferences.userId, userId))
      .returning();
    return toPreferencesDto(row!);
  }
}
