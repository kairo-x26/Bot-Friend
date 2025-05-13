import { Logger } from '@nestjs/common';

export interface ErrorReporter {
  capture(err: unknown, context?: Record<string, string>): void;
}

export const ERROR_REPORTER = Symbol('ERROR_REPORTER');

export class LogErrorReporter implements ErrorReporter {
  private readonly logger = new Logger('Errors');
  capture(err: unknown, context?: Record<string, string>) {
    this.logger.error({ err, ...context }, (err as Error)?.message ?? 'error');
  }
}

/**
 * Sentry-compatible reporting. Request bodies, cookies and auth headers are
 * stripped before anything leaves the process.
 */
export async function createErrorReporter(
  dsn: string | undefined,
  environment: string,
): Promise<ErrorReporter> {
  if (!dsn) return new LogErrorReporter();
  const Sentry = await import('@sentry/node');
  Sentry.init({
    dsn,
    environment,
    tracesSampleRate: 0,
    beforeSend(event) {
      if (event.request) {
        delete event.request.data;
        delete event.request.cookies;
        if (event.request.headers) delete event.request.headers['authorization'];
      }
      return event;
    },
  });
  return {
    capture(err, context) {
      Sentry.withScope((scope) => {
        if (context) scope.setTags(context);
        Sentry.captureException(err);
      });
    },
  };
}
