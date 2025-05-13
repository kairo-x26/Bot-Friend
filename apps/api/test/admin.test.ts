import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { auditEvents, users } from '../src/db/schema.js';
import { createTestApp, type TestApp } from './support/app.js';
import { call, devLogin, newConversation, streamMessage } from './support/http.js';

let t: TestApp;
let admin: string;
let moderator: string;
let member: { token: string; id: string };

async function withRole(email: string, role: 'admin' | 'moderator') {
  const s = await devLogin(t, email);
  await t.db.update(users).set({ role }).where(eq(users.id, s.user.id));
  return (await devLogin(t, email)).accessToken;
}

async function fileReport(token: string, category: string) {
  const convo = await newConversation(t, token);
  const res = await streamMessage(t, token, convo.id, `joke please ${Math.random()}`);
  const messageId = (res.terminal as { message: { id: string } }).message.id;
  return (await call(t, 'POST', '/v1/reports', { token, body: { messageId, category } })).json;
}

beforeAll(async () => {
  t = await createTestApp();
  admin = await withRole('admin@example.com', 'admin');
  moderator = await withRole('mod@example.com', 'moderator');
  const m = await devLogin(t, 'member@example.com');
  member = { token: m.accessToken, id: m.user.id };
});
afterAll(() => t.close());

describe('admin access control', () => {
  it('rejects regular users from every admin route', async () => {
    for (const url of [
      '/v1/admin/reports',
      '/v1/admin/metrics',
      '/v1/admin/audit',
      `/v1/admin/users/${member.id}`,
    ]) {
      expect((await call(t, 'GET', url, { token: member.token })).status, url).toBe(403);
    }
  });

  it('lets moderators review but not suspend', async () => {
    expect((await call(t, 'GET', '/v1/admin/reports', { token: moderator })).status).toBe(200);
    const res = await call(t, 'POST', `/v1/admin/users/${member.id}/suspend`, {
      token: moderator,
      body: { reason: 'spam' },
    });
    expect(res.status).toBe(403);
  });
});

describe('moderation queue', () => {
  it('orders by urgency, then age, and paginates', async () => {
    const r1 = await fileReport(member.token, 'not_funny');
    const r2 = await fileReport(member.token, 'self_harm');
    const r3 = await fileReport(member.token, 'offensive');
    const p1 = await call(t, 'GET', '/v1/admin/reports?status=open&limit=2', { token: moderator });
    expect(p1.json.items.map((r: any) => r.id)).toEqual([r2.id, r3.id]);
    const p2 = await call(
      t,
      'GET',
      `/v1/admin/reports?status=open&limit=2&cursor=${p1.json.nextCursor}`,
      { token: moderator },
    );
    expect(p2.json.items.map((r: any) => r.id)).toEqual([r1.id]);
  });

  it('shows evidence, audits the view, and resolves the case', async () => {
    const report = await fileReport(member.token, 'harassment');
    const detail = await call(t, 'GET', `/v1/admin/reports/${report.id}`, { token: moderator });
    expect(detail.json.evidence.precedingUserContent).toMatch(/joke please/);

    const resolved = await call(t, 'PATCH', `/v1/admin/reports/${report.id}`, {
      token: moderator,
      body: { status: 'actioned', resolution: 'Added to red-team set' },
    });
    expect(resolved.json).toMatchObject({
      status: 'actioned',
      resolution: 'Added to red-team set',
    });
    expect(resolved.json.resolvedAt).toBeTruthy();

    const audit = await t.db.select().from(auditEvents).where(eq(auditEvents.targetId, report.id));
    expect(audit.map((a) => a.action).sort()).toEqual(['report.actioned', 'report.viewed']);
  });

  it('404s unknown reports', async () => {
    expect(
      (
        await call(t, 'GET', '/v1/admin/reports/00000000-0000-4000-8000-000000000000', {
          token: moderator,
        })
      ).status,
    ).toBe(404);
  });
});

describe('user management', () => {
  it('suspends (revoking sessions) and reinstates', async () => {
    const victim = await devLogin(t);
    const suspended = await call(t, 'POST', `/v1/admin/users/${victim.user.id}/suspend`, {
      token: admin,
      body: { reason: 'abuse reports' },
    });
    expect(suspended.json.status).toBe('suspended');
    expect((await call(t, 'GET', '/v1/me', { token: victim.accessToken })).status).toBe(401);

    await call(t, 'POST', `/v1/admin/users/${victim.user.id}/reinstate`, {
      token: admin,
      body: { reason: 'appeal ok' },
    });
    const again = await devLogin(
      t,
      (await t.db.select().from(users).where(eq(users.id, victim.user.id)))[0]!.providerSubject,
    );
    expect((await call(t, 'GET', '/v1/me', { token: again.accessToken })).status).toBe(200);
  });

  it('prevents admins changing their own status or role', async () => {
    const me = await call(t, 'GET', '/v1/me', { token: admin });
    expect(
      (
        await call(t, 'PATCH', `/v1/admin/users/${me.json.user.id}/role`, {
          token: admin,
          body: { role: 'user' },
        })
      ).status,
    ).toBe(403);
  });

  it('shows a content-free user summary', async () => {
    const res = await call(t, 'GET', `/v1/admin/users/${member.id}`, { token: moderator });
    expect(res.json.stats.reportsFiled).toBeGreaterThan(0);
    expect(JSON.stringify(res.json)).not.toMatch(/joke please/);
  });
});

describe('metrics and audit log', () => {
  it('summarises the last 24 hours', async () => {
    const res = await call(t, 'GET', '/v1/admin/metrics', { token: moderator });
    expect(res.status).toBe(200);
    expect(res.json.last24h.messages).toBeGreaterThan(0);
    expect(res.json.openReports.urgent).toBeGreaterThan(0);
    expect(typeof res.json.last24h.p95LatencyMs).toBe('number');
  });

  it('pages the audit log newest first', async () => {
    const p1 = await call(t, 'GET', '/v1/admin/audit?limit=2', { token: moderator });
    expect(p1.json.items).toHaveLength(2);
    const p2 = await call(t, 'GET', `/v1/admin/audit?limit=2&cursor=${p1.json.nextCursor}`, {
      token: moderator,
    });
    expect(p2.json.items[0].occurredAt <= p1.json.items[1].occurredAt).toBe(true);
  });
});
