import 'reflect-metadata';
import type { LogLevel } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { randomUUID } from 'node:crypto';
import { AppModule, type AppModuleOptions } from './app.module.js';
import { ErrorFilter } from './common/error.filter.js';
import { httpDuration, httpRequests } from './observability/metrics.js';
import { createErrorReporter } from './observability/error-reporter.js';

const NEST_LEVELS: Record<string, LogLevel[] | false> = {
  silent: false,
  fatal: ['fatal'],
  error: ['fatal', 'error'],
  warn: ['fatal', 'error', 'warn'],
  info: ['fatal', 'error', 'warn', 'log'],
  debug: ['fatal', 'error', 'warn', 'log', 'debug'],
  trace: ['fatal', 'error', 'warn', 'log', 'debug', 'verbose'],
};

const REQUEST_ID_RE = /^[A-Za-z0-9._-]{8,100}$/;

export async function createApp(options: AppModuleOptions): Promise<NestFastifyApplication> {
  const { config } = options;
  const adapter = new FastifyAdapter({
    logger:
      config.env.LOG_LEVEL === 'silent'
        ? false
        : {
            level: config.env.LOG_LEVEL,
            // Never log message bodies or tokens.
            redact: ['req.headers.authorization', 'req.body', 'res.body'],
          },
    bodyLimit: 64 * 1024,
    trustProxy: true,
    requestIdHeader: false,
    genReqId: (req: { headers: Record<string, string | string[] | undefined> }) => {
      const incoming = req.headers['x-request-id'];
      return typeof incoming === 'string' && REQUEST_ID_RE.test(incoming) ? incoming : randomUUID();
    },
  });

  const app = await NestFactory.create<NestFastifyApplication>(AppModule.register(options), adapter, {
    logger: NEST_LEVELS[config.env.LOG_LEVEL] ?? ['error', 'warn', 'log'],
    bufferLogs: false,
    abortOnError: false,
  });

  const fastify = app.getHttpAdapter().getInstance();
  fastify.addHook('onRequest', async (req, reply) => {
    reply.header('x-request-id', req.id);
  });
  fastify.addHook('onResponse', async (req, reply) => {
    // routeOptions.url is the pattern (/v1/conversations/:id), never the raw path with ids.
    const route = req.routeOptions?.url ?? 'unmatched';
    httpRequests.inc({ method: req.method, route, status: `${Math.floor(reply.statusCode / 100)}xx` });
    httpDuration.observe({ method: req.method, route }, reply.elapsedTime / 1000);
  });

  app.enableCors({
    origin: config.env.CORS_ORIGINS.length ? config.env.CORS_ORIGINS : !config.isProduction,
    methods: ['GET', 'HEAD', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['authorization', 'content-type', 'accept', 'x-request-id'],
    exposedHeaders: ['x-request-id', 'retry-after'],
    maxAge: 600,
  });
  app.useGlobalFilters(new ErrorFilter(await createErrorReporter(config.env.SENTRY_DSN, config.env.NODE_ENV)));
  app.enableShutdownHooks();
  await app.init();
  return app;
}
