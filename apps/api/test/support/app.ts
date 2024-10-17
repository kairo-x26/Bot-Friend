import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createApp } from '../../src/bootstrap.js';
import { AppConfig } from '../../src/config/config.js';
import { DB, type Db } from '../../src/db/database.js';

export interface TestApp {
  app: NestFastifyApplication;
  db: Db;
  config: AppConfig;
  close(): Promise<void>;
}

export const TEST_ENV: Record<string, string> = {
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  DATABASE_EMBEDDED: 'true',
  AUTH_DEV_LOGIN: 'true',
  AI_PROVIDER: 'mock',
  RETENTION_SWEEP_MINUTES: '0',
};

export async function createTestApp(env: Record<string, string> = {}): Promise<TestApp> {
  const config = AppConfig.fromEnv({ ...TEST_ENV, ...env });
  const app = await createApp({ config });
  const db = app.get<Db>(DB);
  return { app, db, config, close: () => app.close() };
}
