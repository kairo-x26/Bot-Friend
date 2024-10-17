import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { randomUUID } from 'node:crypto';
import { AppModule, type AppModuleOptions } from './app.module.js';
import { ErrorFilter } from './common/error.filter.js';

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
    logger: config.env.LOG_LEVEL === 'silent' ? false : ['error', 'warn', 'log'],
    bufferLogs: false,
    abortOnError: false,
  });

  const fastify = app.getHttpAdapter().getInstance();
  fastify.addHook('onRequest', async (req, reply) => {
    reply.header('x-request-id', req.id);
  });

  app.enableCors({
    origin: config.env.CORS_ORIGINS.length ? config.env.CORS_ORIGINS : !config.isProduction,
    exposedHeaders: ['x-request-id', 'retry-after'],
  });
  app.useGlobalFilters(new ErrorFilter());
  app.enableShutdownHooks();
  await app.init();
  return app;
}
