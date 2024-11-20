import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { RetentionService } from '../src/account/retention.service.js';
import {
  analyticsEvents,
  auditEvents,
  contentReports,
  conversations,
  deletionJobs,
  messages,
  usageRecords,
  users,
} from '../src/db/schema.js';
import { createTestApp, type TestApp } from './support/app.js';
import { call, devLogin, guestLogin, newConversation, streamMessage } from './support/http.js';

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(() => t.close());

async function replyId(token: string) {
  const convo = await newConversation(t, token);
  const res = await streamMessage(t, token, convo.id, 'tell me a joke');
  return { convo, messageId: (res.terminal as { message: { id: string } }).message.id };
}

describe('POST /v1/reports', () => {
  it('opens a case with a minimal evidence snapshot', async () => {
    const u = await devLogin(t);
    const { messageId } = await replyId(u.accessToken);
    const res = await call(t, 'POST', '/v1/reports', {
      token: u.accessToken,
      body: { messageId, category: 'offensive', note: 'not cool' },
    });
    expect(res.status).toBe(201);
    expect(res.json).toMatchObject({ messageId, category: 'offensive', status: 'open' });

    const [row] = await t.db.select().from(contentReports).where(eq(contentReports.id, res.json.id));
    expect(row!.evidence.precedingUserContent).toBe('tell me a joke');
    expect(row!.evidence.reportedContent.length).toBeGreaterThan(0);
    expect(row!.evidence.promptVersion).toBeTruthy();
  });

  it('does not create duplicate cases on retry', async () => {
    const u = await devLogin(t);
    const { messageId } = await replyId(u.accessToken);
    const body = { messageId, category: 'not_funny' };
    const a = await call(t, 'POST', '/v1/reports', { token: u.accessToken, body });
    const b = await call(t, 'POST', '/v1/reports', { token: u.accessToken, body });
    expect(a.status).toBe(201);
    expect(b.status).toBe(200);
    expect(b.json.id).toBe(a.json.id);
  });

  it('only allows reporting your own assistant messages', async () => {
    const owner = await devLogin(t);
    const other = await devLogin(t);
    const { messageId } = await replyId(owner.accessToken);
    expect(
      (await call(t, 'POST', '/v1/reports', { token: other.accessToken, body: { messageId, category: 'other' } })).status,
    ).toBe(404);
  });

  it('records a report_submitted analytics event without content', async () => {
    const events = await t.db.select().from(analyticsEvents).where(eq(analyticsEvents.name, 'report_submitted'));
    expect(events.length).toBeGreaterThan(0);
    expect(JSON.stringify(events)).not.toMatch(/not cool/);
  });
});

describe('POST /v1/account/deletion', () => {
  it('requires explicit confirmation', async () => {
    const u = await devLogin(t);
    expect((await call(t, 'POST', '/v1/account/deletion', { token: u.accessToken, body: {} })).status).toBe(400);
  });

  it('revokes access immediately and removes account data', async () => {
    const u = await devLogin(t, 'leaving@example.com');
    const { convo, messageId } = await replyId(u.accessToken);
    await call(t, 'POST', '/v1/reports', { token: u.accessToken, body: { messageId, category: 'other' } });

    const res = await call(t, 'POST', '/v1/account/deletion', { token: u.accessToken, body: { confirm: 'DELETE' } });
    expect(res.status).toBe(202);
    expect(res.json.jobId).toBeTruthy();
    expect((await call(t, 'GET', '/v1/me', { token: u.accessToken })).status).toBe(401);

    let job;
    for (let i = 0; i < 50; i++) {
      [job] = await t.db.select().from(deletionJobs).where(eq(deletionJobs.id, res.json.jobId));
      if (job?.status === 'completed') break;
      await new Promise((r) => setTimeout(r, 20));
    }
    expect(job!.status).toBe('completed');
    expect(Object.keys(job!.steps)).toEqual(
      expect.arrayContaining(['conversations', 'memories', 'analytics', 'user']),
    );

    expect(await t.db.select().from(users).where(eq(users.id, u.user.id))).toHaveLength(0);
    expect(await t.db.select().from(conversations).where(eq(conversations.id, convo.id))).toHaveLength(0);
    expect(await t.db.select().from(messages).where(eq(messages.userId, u.user.id))).toHaveLength(0);
    // Cost and safety records stay, detached from the person.
    const usage = await t.db.select().from(usageRecords).where(eq(usageRecords.messageId, messageId));
    expect(usage[0]!.userId).toBeNull();
    const [report] = await t.db.select().from(contentReports).where(eq(contentReports.messageId, messageId));
    expect(report!.reporterId).toBeNull();
    const audit = await t.db.select().from(auditEvents).where(eq(auditEvents.targetId, u.user.id));
    expect(audit.map((a) => a.action)).toEqual(expect.arrayContaining(['account.deletion_requested', 'account.deleted']));

    // Signing in again starts a brand-new, empty account.
    const again = await devLogin(t, 'leaving@example.com');
    expect(again.user.id).not.toBe(u.user.id);
    const list = await call(t, 'GET', '/v1/conversations', { token: again.accessToken });
    expect(list.json.items).toHaveLength(0);
  });
});

describe('RetentionService.sweep', () => {
  it('purges old guests, old analytics and stuck streams', async () => {
    const retention = t.app.get(RetentionService);
    const oldGuest = await guestLogin(t);
    const newGuest = await guestLogin(t);
    await t.db.update(users).set({ createdAt: new Date(Date.now() - 8 * 86_400_000) }).where(eq(users.id, oldGuest.user.id));

    const u = await devLogin(t);
    const convo = await newConversation(t, u.accessToken);
    const [stuck] = await t.db
      .insert(messages)
      .values({
        conversationId: convo.id,
        userId: u.user.id,
        role: 'assistant',
        content: '',
        status: 'streaming',
        createdAt: new Date(Date.now() - 10 * 60_000),
      })
      .returning();
    await t.db.insert(analyticsEvents).values({ name: 'chat_started', occurredAt: new Date(Date.now() - 100 * 86_400_000) });

    const result = await retention.sweep();
    expect(result.guestsPurged).toBe(1);
    expect(result.staleStreamsFailed).toBe(1);
    expect(result.analyticsPurged).toBeGreaterThanOrEqual(1);
    expect((await call(t, 'GET', '/v1/me', { token: oldGuest.accessToken })).status).toBe(401);
    expect((await call(t, 'GET', '/v1/me', { token: newGuest.accessToken })).status).toBe(200);
    const [row] = await t.db.select().from(messages).where(eq(messages.id, stuck!.id));
    expect(row!.status).toBe('failed');
  });
});
