import { z } from 'zod';

/**
 * Stable error codes returned by the API. Clients branch on `code`, never on `message`.
 * Add new codes at the end; never rename or reuse one.
 */
export const ErrorCode = {
  ValidationFailed: 'validation_failed',
  Unauthenticated: 'unauthenticated',
  Forbidden: 'forbidden',
  NotFound: 'not_found',
  Conflict: 'conflict',
  AgeIneligible: 'age_ineligible',
  RateLimited: 'rate_limited',
  QuotaExceeded: 'quota_exceeded',
  ContentBlocked: 'content_blocked',
  ProviderUnavailable: 'provider_unavailable',
  IdempotencyMismatch: 'idempotency_mismatch',
  AccountDeleted: 'account_deleted',
  FeatureDisabled: 'feature_disabled',
  Internal: 'internal_error',
  /** Generation was stopped by the user. Only appears in stream events. */
  Cancelled: 'cancelled',
} as const;
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export const errorCodeSchema = z.enum(Object.values(ErrorCode) as [ErrorCode, ...ErrorCode[]]);

export const apiErrorSchema = z.object({
  error: z.object({
    code: errorCodeSchema,
    message: z.string(),
    requestId: z.string().optional(),
    details: z.unknown().optional(),
    retryAfterSeconds: z.number().int().nonnegative().optional(),
  }),
});
export type ApiErrorBody = z.infer<typeof apiErrorSchema>;

/** Codes where retrying the same request later can succeed. */
export const RETRYABLE_CODES: ReadonlySet<ErrorCode> = new Set([
  ErrorCode.RateLimited,
  ErrorCode.ProviderUnavailable,
  ErrorCode.Internal,
]);
