import { ErrorCode } from '@bot-friend/shared';
import type { z } from 'zod';
import { ApiError } from './api-error.js';

/** Parse untrusted input or throw a `validation_failed` error with field details. */
export function parse<T extends z.ZodTypeAny>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input ?? {});
  if (!result.success) {
    const details = result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
    throw new ApiError(ErrorCode.ValidationFailed, details[0]?.message ?? 'Invalid request', { details });
  }
  return result.data;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Path ids that are not UUIDs can never exist; answer 404 rather than a DB error. */
export function assertUuid(id: string, what = 'Resource'): string {
  if (!UUID_RE.test(id)) throw ApiError.notFound(what);
  return id;
}
