import type { Preferences, User } from '@bot-friend/shared';
import type { PreferencesRow, UserRow } from '../db/schema.js';

export function toUserDto(row: UserRow): User {
  return {
    id: row.id,
    provider: row.provider,
    displayName: row.displayName,
    role: row.role,
    isGuest: row.provider === 'guest',
    createdAt: row.createdAt.toISOString(),
  };
}

export function toPreferencesDto(row: PreferencesRow): Preferences {
  return {
    comedyStyle: row.comedyStyle,
    energy: row.energy,
    humorBoundaries: row.humorBoundaries as Preferences['humorBoundaries'],
    roastOptIn: row.roastOptIn,
    theme: row.theme,
    reducedMotion: row.reducedMotion,
    largeText: row.largeText,
    hapticsEnabled: row.hapticsEnabled,
    mascotColor: row.mascotColor,
    locale: row.locale,
    memoryEnabled: row.memoryEnabled,
    remindersEnabled: row.remindersEnabled,
    reminderHour: row.reminderHour,
  };
}
