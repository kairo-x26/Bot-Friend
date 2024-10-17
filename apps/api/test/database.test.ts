import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { botProfiles, users } from '../src/db/schema.js';
import { createTestApp, type TestApp } from './support/app.js';

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(() => t.close());

describe('database', () => {
  it('runs migrations and seeds the default bot profile', async () => {
    const rows = await t.db.select().from(botProfiles);
    expect(rows.map((r) => r.id)).toContain('bot-friend');
  });

  it('enforces unique provider subjects', async () => {
    await t.db.insert(users).values({ provider: 'dev', providerSubject: 'dup@example.com' });
    await expect(
      t.db.insert(users).values({ provider: 'dev', providerSubject: 'dup@example.com' }),
    ).rejects.toThrow();
  });

  it('is real postgres', async () => {
    const res = await t.db.execute(sql`select version()`);
    expect(JSON.stringify(res)).toMatch(/PostgreSQL/);
  });
});
