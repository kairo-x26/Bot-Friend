/** "just now", "5m", "3h", "Tue", "Mar 4" — compact times for lists. */
export function relativeTime(iso: string, now = Date.now()): string {
  const then = new Date(iso).getTime();
  const diff = Math.max(0, now - then);
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours}h`;
  const d = new Date(then);
  if (hours < 24 * 6) return d.toLocaleDateString('en-US', { weekday: 'short' });
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** Local hour (0-23) → the UTC hour the server schedules against. */
export function localHourToUtc(
  hour: number,
  offsetMinutes = new Date().getTimezoneOffset(),
): number {
  return ((((hour + offsetMinutes / 60) % 24) + 24) % 24) | 0;
}

export function utcHourToLocal(
  hour: number,
  offsetMinutes = new Date().getTimezoneOffset(),
): number {
  return ((((hour - offsetMinutes / 60) % 24) + 24) % 24) | 0;
}
