import type { ReportCategory } from '@bot-friend/shared';

export const CATEGORY_LABEL: Record<ReportCategory, string> = {
  self_harm: 'Self-harm',
  sexual: 'Sexual content',
  harassment: 'Harassment',
  offensive: 'Offensive',
  misinformation: 'Misinformation',
  not_funny: 'Not funny',
  other: 'Other',
};

export const PRIORITY_LABEL = ['Urgent', 'High', 'Normal', 'Low'];

export function age(iso: string, now = Date.now()): string {
  const min = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));
  if (min < 60) return `${min}m ago`;
  const h = Math.round(min / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export function dateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
}
