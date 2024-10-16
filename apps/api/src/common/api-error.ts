import { HttpStatus } from '@nestjs/common';
import { ErrorCode } from '@bot-friend/shared';

const STATUS: Record<ErrorCode, number> = {
  [ErrorCode.ValidationFailed]: HttpStatus.BAD_REQUEST,
  [ErrorCode.Unauthenticated]: HttpStatus.UNAUTHORIZED,
  [ErrorCode.Forbidden]: HttpStatus.FORBIDDEN,
  [ErrorCode.NotFound]: HttpStatus.NOT_FOUND,
  [ErrorCode.Conflict]: HttpStatus.CONFLICT,
  [ErrorCode.AgeIneligible]: HttpStatus.FORBIDDEN,
  [ErrorCode.RateLimited]: HttpStatus.TOO_MANY_REQUESTS,
  [ErrorCode.QuotaExceeded]: HttpStatus.TOO_MANY_REQUESTS,
  [ErrorCode.ContentBlocked]: 422,
  [ErrorCode.ProviderUnavailable]: HttpStatus.SERVICE_UNAVAILABLE,
  [ErrorCode.IdempotencyMismatch]: HttpStatus.CONFLICT,
  [ErrorCode.AccountDeleted]: HttpStatus.GONE,
  [ErrorCode.FeatureDisabled]: HttpStatus.NOT_FOUND,
  [ErrorCode.Internal]: HttpStatus.INTERNAL_SERVER_ERROR,
};

export class ApiError extends Error {
  readonly status: number;

  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly options: { details?: unknown; retryAfterSeconds?: number } = {},
  ) {
    super(message);
    this.status = STATUS[code];
  }

  static notFound(what = 'Resource') {
    return new ApiError(ErrorCode.NotFound, `${what} not found`);
  }
  static unauthenticated(message = 'Sign in to continue') {
    return new ApiError(ErrorCode.Unauthenticated, message);
  }
  static forbidden(message = 'You do not have access to this') {
    return new ApiError(ErrorCode.Forbidden, message);
  }
}
