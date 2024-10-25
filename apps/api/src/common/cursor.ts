import { ErrorCode } from '@bot-friend/shared';
import { ApiError } from './api-error.js';

export interface Cursor {
  /** ISO timestamp of the last item on the previous page. */
  t: string;
  id: string;
}

export function encodeCursor(at: Date, id: string): string {
  return Buffer.from(JSON.stringify({ t: at.toISOString(), id } satisfies Cursor)).toString('base64url');
}

export function decodeCursor(raw: string | undefined): { at: Date; id: string } | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as Partial<Cursor>;
    const at = new Date(parsed.t ?? '');
    if (typeof parsed.id !== 'string' || Number.isNaN(at.getTime())) throw new Error('bad');
    return { at, id: parsed.id };
  } catch {
    throw new ApiError(ErrorCode.ValidationFailed, 'Invalid cursor');
  }
}
