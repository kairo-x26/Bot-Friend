import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { escapeLike, snippet } from '../src/search/search.service.js';
import { createTestApp, type TestApp } from './support/app.js';
import { call, devLogin, newConversation, streamMessage } from './support/http.js';

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(() => t.close());

describe('GET /v1/search', () => {
  it('finds the user’s own messages, newest first, with highlighted snippets', async () => {
    const u = await devLogin(t);
    const other = await devLogin(t);
    const c1 = await newConversation(t, u.accessToken);
    await streamMessage(t, u.accessToken, c1.id, 'my pet iguana Steve is plotting something');
    const c2 = await newConversation(t, u.accessToken);
    await streamMessage(t, u.accessToken, c2.id, 'Steve escaped again lol');
    const oc = await newConversation(t, other.accessToken);
    await streamMessage(t, other.accessToken, oc.id, 'Steve is my name too');

    const res = await call(t, 'GET', '/v1/search?q=steve', { token: u.accessToken });
    expect(res.status).toBe(200);
    expect(res.json.items.map((h: any) => h.conversationId)).toEqual([c2.id, c1.id]);
    expect(res.json.items[0].snippet).toBe('[Steve] escaped again lol');
    expect(res.json.items.every((h: any) => h.role === 'user')).toBe(true);
  });

  it('treats % and _ literally and validates the query', async () => {
    const u = await devLogin(t);
    const c = await newConversation(t, u.accessToken);
    await streamMessage(t, u.accessToken, c.id, 'I am 100% done with mondays');
    expect((await call(t, 'GET', '/v1/search?q=100%25', { token: u.accessToken })).json.items).toHaveLength(1);
    expect((await call(t, 'GET', '/v1/search?q=%25%25', { token: u.accessToken })).json.items).toHaveLength(0);
    expect((await call(t, 'GET', '/v1/search?q=a', { token: u.accessToken })).status).toBe(400);
  });

  it('builds bounded snippets', () => {
    const long = `${'a '.repeat(100)}needle${' b'.repeat(100)}`;
    const s = snippet(long, 'needle');
    expect(s).toContain('[needle]');
    expect(s.startsWith('…')).toBe(true);
    expect(s.length).toBeLessThan(130);
    expect(escapeLike('50%_off\\')).toBe('50\\%\\_off\\\\');
  });
});

describe('GET /v1/account/export', () => {
  it('returns everything tied to the account as a downloadable JSON file', async () => {
    const u = await devLogin(t);
    const c = await newConversation(t, u.accessToken);
    await streamMessage(t, u.accessToken, c.id, 'export me');
    await call(t, 'POST', '/v1/memories', { token: u.accessToken, body: { content: 'Likes exports' } });

    const res = await call(t, 'GET', '/v1/account/export', { token: u.accessToken });
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toMatch(/attachment; filename="bot-friend-export-\d{4}-\d{2}-\d{2}\.json"/);
    expect(res.json.formatVersion).toBe(1);
    expect(res.json.user.id).toBe(u.user.id);
    expect(res.json.conversations).toHaveLength(1);
    expect(res.json.conversations[0].messages.map((m: any) => m.role)).toEqual(['user', 'assistant']);
    expect(res.json.memories[0].content).toBe('Likes exports');
    expect(JSON.stringify(res.json)).not.toMatch(/providerSubject|sessionVersion|idempotency/);
  });
});
