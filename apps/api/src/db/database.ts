import { Logger } from '@nestjs/common';
import { PGlite } from '@electric-sql/pglite';
import { drizzle as drizzlePg, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate as migratePg } from 'drizzle-orm/node-postgres/migrator';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import type { AppConfig } from '../config/config.js';
import * as schema from './schema.js';

export type Db = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
export type DbOrTx = Db | Tx;

export const DB = Symbol('DB');

export const MIGRATIONS_DIR = fileURLToPath(new URL('../../drizzle', import.meta.url));

export interface DatabaseHandle {
  db: Db;
  close(): Promise<void>;
}

/**
 * Opens either a pooled Postgres connection or an embedded PGlite instance.
 * Both expose the same drizzle query API, so services never know which one they got.
 */
export async function openDatabase(config: AppConfig): Promise<DatabaseHandle> {
  const logger = new Logger('Database');
  const { env } = config;

  if (env.DATABASE_EMBEDDED) {
    const client = new PGlite(env.DATABASE_EMBEDDED_DIR);
    const db = drizzlePglite(client, { schema }) as unknown as Db;
    if (env.RUN_MIGRATIONS) {
      await migratePglite(db as never, { migrationsFolder: MIGRATIONS_DIR });
    }
    logger.log(
      `Embedded database ready${env.DATABASE_EMBEDDED_DIR ? ` at ${env.DATABASE_EMBEDDED_DIR}` : ' (in-memory)'}`,
    );
    return { db, close: () => client.close() };
  }

  const pool = new pg.Pool({
    connectionString: env.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30_000,
  });
  pool.on('error', (err) => logger.error(`Idle client error: ${err.message}`));
  const db = drizzlePg(pool, { schema });
  if (env.RUN_MIGRATIONS) {
    await migratePg(db, { migrationsFolder: MIGRATIONS_DIR });
  }
  return { db, close: () => pool.end() };
}
