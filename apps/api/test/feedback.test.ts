import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { users } from '../src/db/schema.js';
import { eq } from 'drizzle-orm';
import { createTestApp, type TestApp } from './support/app.js';
import { call, devLogin, newConversation, streamMessage } from './support/http.js';

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp({ FEATURE_VOICE: 'true' });
});
afterAll(() => t.close());

describe('reactions', () => {
  it('sets, changes and clears a reaction on an assistant reply', async () => {
    const u = await devLogin(t);
    const convo = await newConversation(t, u.accessToken);
    const res = await streamMessage(t, u.accessToken, convo.id, 'tell me a joke');
    const id = (res.terminal as any).message.id;
    expect((await call(t, 'POST', `/v1/messages/${id}/reaction`, { token: u.accessToken, body: { reaction: 'laugh' } })).json).toEqual({ reaction: 'laugh' });
    await call(t, 'POST', `/v1/messages/${id}/reaction`, { token: u.accessToken, body: { reaction: 'down' } });
    let history = await call(t, 'GET', `/v1/conversations/${convo.id}/messages`, { token: u.accessToken });
    expect(history.json.items.at(-1).reaction).toBe('down');
    await call(t, 'POST', `/v1/messages/${id}/reaction`, { token: u.accessToken, body: { reaction: null } });
    history = await call(t, 'GET', `/v1/conversations/${convo.id}/messages`, { token: u.accessToken });
    expect(history.json.items.at(-1).reaction).toBeNull();
  });

  it('cannot react to user messages or other people’s messages', async () => {
    const u = await devLogin(t);
    const other = await devLogin(t);
    const convo = await newConversation(t, u.accessToken);
    const res = await streamMessage(t, u.accessToken, convo.id, 'hi');
    const userMsgId = (res.events[0] as any).userMessage.id;
    const botMsgId = (res.terminal as any).message.id;
    expect((await call(t, 'POST', `/v1/messages/${userMsgId}/reaction`, { token: u.accessToken, body: { reaction: 'love' } })).status).toBe(404);
    expect((await call(t, 'POST', `/v1/messages/${botMsgId}/reaction`, { token: other.accessToken, body: { reaction: 'love' } })).status).toBe(404);
  });

  it('feeds the positive rating KPI on the admin dashboard', async () => {
    const u = await devLogin(t);
    const convo = await newConversation(t, u.accessToken);
    for (const reaction of ['laugh', 'love', 'up', 'down']) {
      const res = await streamMessage(t, u.accessToken, convo.id, `joke ${reaction}`);
      await call(t, 'POST', `/v1/messages/${(res.terminal as any).message.id}/reaction`, { token: u.accessToken, body: { reaction } });
    }
    const admin = await devLogin(t, 'kpi-admin@example.com');
    await t.db.update(users).set({ role: 'admin' }).where(eq(users.id, admin.user.id));
    const token = (await devLogin(t, 'kpi-admin@example.com')).accessToken;
    const metrics = await call(t, 'GET', '/v1/admin/metrics', { token });
    expect(metrics.json.last24h.ratedReplies).toBe(4);
    expect(metrics.json.last24h.positiveRatingShare).toBe(0.75);
  });
});

describe('GET /v1/features', () => {
  it('reports feature flags publicly', async () => {
    expect((await call(t, 'GET', '/v1/features')).json).toEqual({ memory: true, voice: true, billing: false });
  });
});
