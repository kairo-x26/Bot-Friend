import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { pushDevices, users } from '../src/db/schema.js';
import { RecordingPushProvider, type PushProvider } from '../src/reminders/push.provider.js';
import { REMINDER_LINES, ReminderService } from '../src/reminders/reminder.service.js';
import { createTestApp, type TestApp } from './support/app.js';
import { call, devLogin, guestLogin } from './support/http.js';

class ExpiringPush implements PushProvider {
  readonly name = 'expiring';
  inner = new RecordingPushProvider();
  async send(tokens: string[], message: { title: string; body: string }) {
    await this.inner.send(tokens, message);
    return { invalidTokens: tokens.filter((t) => t.includes('dead')) };
  }
}

let t: TestApp;
const push = new ExpiringPush();
const at = (hour: number) => new Date(Date.UTC(2025, 2, 10, hour, 5));

beforeAll(async () => {
  t = await createTestApp({}, { push });
});
afterAll(() => t.close());

async function optedIn(hour: number, device = `ExponentPushToken[${Math.random().toString(36).slice(2)}]`) {
  const s = await devLogin(t);
  await call(t, 'PATCH', '/v1/me/preferences', { token: s.accessToken, body: { remindersEnabled: true, reminderHour: hour } });
  await call(t, 'POST', '/v1/devices', { token: s.accessToken, body: { token: device, platform: 'ios' } });
  // Pretend they were last here two days ago.
  await t.db.update(users).set({ lastSeenAt: new Date(at(hour).getTime() - 48 * 3600_000) }).where(eq(users.id, s.user.id));
  return { ...s, device };
}

describe('reminders', () => {
  it('sends one gentle reminder at the chosen hour and not again that day', async () => {
    const svc = t.app.get(ReminderService);
    const u = await optedIn(9);
    push.inner.sent.length = 0;
    expect((await svc.tick(at(8))).sent).toBe(0);
    expect((await svc.tick(at(9))).sent).toBe(1);
    expect(push.inner.sent[0]!.tokens).toEqual([u.device]);
    expect(REMINDER_LINES).toContain(push.inner.sent[0]!.message.body);
    expect((await svc.tick(new Date(at(9).getTime() + 30 * 60_000))).sent).toBe(0);
  });

  it('skips people who were active recently, guests and those who opted out', async () => {
    const svc = t.app.get(ReminderService);
    const active = await optedIn(11);
    await t.db.update(users).set({ lastSeenAt: new Date(at(11).getTime() - 3600_000) }).where(eq(users.id, active.user.id));
    const off = await optedIn(11);
    await call(t, 'PATCH', '/v1/me/preferences', { token: off.accessToken, body: { remindersEnabled: false } });
    const g = await guestLogin(t);
    await call(t, 'PATCH', '/v1/me/preferences', { token: g.accessToken, body: { remindersEnabled: true, reminderHour: 11 } });
    await call(t, 'POST', '/v1/devices', { token: g.accessToken, body: { token: 'ExponentPushToken[guest]', platform: 'ios' } });
    expect((await svc.tick(at(11))).sent).toBe(0);
  });

  it('drops device tokens the push service rejects', async () => {
    const svc = t.app.get(ReminderService);
    const u = await optedIn(13, 'ExponentPushToken[dead-device]');
    await svc.tick(at(13));
    expect(await t.db.select().from(pushDevices).where(eq(pushDevices.userId, u.user.id))).toHaveLength(0);
  });

  it('defaults the hour when reminders are switched on without one', async () => {
    const s = await devLogin(t);
    const res = await call(t, 'PATCH', '/v1/me/preferences', { token: s.accessToken, body: { remindersEnabled: true } });
    expect(res.json.reminderHour).toBe(18);
  });

  it('moves a device token to whoever registered it last', async () => {
    const a = await devLogin(t);
    const b = await devLogin(t);
    const token = 'ExponentPushToken[shared-phone]';
    await call(t, 'POST', '/v1/devices', { token: a.accessToken, body: { token, platform: 'android' } });
    await call(t, 'POST', '/v1/devices', { token: b.accessToken, body: { token, platform: 'android' } });
    const rows = await t.db.select().from(pushDevices).where(eq(pushDevices.token, token));
    expect(rows.map((r) => r.userId)).toEqual([b.user.id]);
    await call(t, 'DELETE', `/v1/devices/${encodeURIComponent(token)}`, { token: b.accessToken });
    expect(await t.db.select().from(pushDevices).where(eq(pushDevices.token, token))).toHaveLength(0);
  });
});
