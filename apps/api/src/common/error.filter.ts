import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { ErrorCode, type ApiErrorBody } from '@bot-friend/shared';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { ApiError } from './api-error.js';

const HTTP_TO_CODE: Record<number, ErrorCode> = {
  400: ErrorCode.ValidationFailed,
  401: ErrorCode.Unauthenticated,
  403: ErrorCode.Forbidden,
  404: ErrorCode.NotFound,
  409: ErrorCode.Conflict,
  413: ErrorCode.ValidationFailed,
  415: ErrorCode.ValidationFailed,
  429: ErrorCode.RateLimited,
};

/** Maps every thrown error to the stable `{ error: { code, message } }` envelope. */
@Catch()
export class ErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger('ErrorFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const reply = ctx.getResponse<FastifyReply>();
    const req = ctx.getRequest<FastifyRequest>();
    const requestId = String(req.id);

    let status = 500;
    let body: ApiErrorBody;

    if (exception instanceof ApiError) {
      status = exception.status;
      body = {
        error: {
          code: exception.code,
          message: exception.message,
          requestId,
          details: exception.options.details,
          retryAfterSeconds: exception.options.retryAfterSeconds,
        },
      };
      if (exception.options.retryAfterSeconds !== undefined) {
        reply.header('retry-after', String(exception.options.retryAfterSeconds));
      }
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const code = HTTP_TO_CODE[status] ?? (status >= 500 ? ErrorCode.Internal : ErrorCode.ValidationFailed);
      body = { error: { code, message: exception.message, requestId } };
    } else if (isFastifyError(exception)) {
      status = exception.statusCode;
      const code = HTTP_TO_CODE[status] ?? (status >= 500 ? ErrorCode.Internal : ErrorCode.ValidationFailed);
      body = { error: { code, message: status >= 500 ? 'Something went wrong' : exception.message, requestId } };
    } else {
      this.logger.error({ err: exception, requestId }, 'Unhandled error');
      body = { error: { code: ErrorCode.Internal, message: 'Something went wrong', requestId } };
    }

    if (reply.sent || reply.raw.headersSent) {
      // Streaming responses already committed headers; nothing sensible left to send.
      return;
    }
    void reply.status(status).send(body);
  }
}

function isFastifyError(e: unknown): e is { statusCode: number; message: string } {
  return typeof e === 'object' && e !== null && typeof (e as { statusCode?: unknown }).statusCode === 'number';
}
