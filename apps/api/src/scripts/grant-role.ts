/**
 * Bootstrap moderators/admins from the command line (there is no self-service path):
 *   pnpm --filter @bot-friend/api grant-role <user-id | provider:subject> <user|moderator|admin>
 */
import { and, eq, sql } from 'drizzle-orm';
import { AppConfig } from '../config/config.js';
import { openDatabase } from '../db/database.js';
import { auditEvents, users } from '../db/schema.js';

const [target, role] = process.argv.slice(2);
if (!target || !role || !['user', 'moderator', 'admin'].includes(role)) {
  console.error('Usage: grant-role <user-id | provider:subject> <user|moderator|admin>');
  process.exit(1);
}

const handle = await openDatabase(AppConfig.fromEnv({ ...process.env, RUN_MIGRATIONS: 'false' }));
try {
  const [provider, ...rest] = target.split(':');
  const where = rest.length
    ? and(eq(users.provider, provider as 'dev'), eq(users.providerSubject, rest.join(':')))
    : eq(users.id, target);
  const updated = await handle.db
    .update(users)
    .set({ role: role as 'admin', sessionVersion: sql`${users.sessionVersion} + 1` })
    .where(where)
    .returning({ id: users.id });
  if (updated.length === 0) {
    console.error('No matching user. They need to sign in once first.');
    process.exitCode = 1;
  } else {
    await handle.db.insert(auditEvents).values({
      actorId: null,
      action: 'user.role_changed',
      targetType: 'user',
      targetId: updated[0]!.id,
      metadata: { to: role, via: 'cli' },
    });
    console.log(`User ${updated[0]!.id} is now ${role}. Existing sessions were signed out.`);
  }
} finally {
  await handle.close();
}
