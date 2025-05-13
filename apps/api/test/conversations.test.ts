import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { messages } from '../src/db/schema.js';
import { createTestApp, type TestApp } from './support/app.js';
import { call, devLogin } from './support/http.js';

let t: TestApp;
let alice: { token: string; id: string };
let bob: { token: string; id: string };

beforeAll(async () => {
  t = await createTestApp();
  const a = await devLogin(t, 'alice@example.com');
  const b = await devLogin(t, 'bob@example.com');
  alice = { token: a.accessToken, id: a.user.id };
  bob = { token: b.accessToken, id: b.user.id };
});
afterAll(() => t.close());

const create = (token: string, body: object = {}) =>
  call(t, 'POST', '/v1/conversations', { token, body });

describe('conversations', () => {
  it('creates a conversation using the current comedy style', async () => {
    await call(t, 'PATCH', '/v1/me/preferences', {
      token: alice.token,
      body: { comedyStyle: 'chill' },
    });
    const res = await create(alice.token);
    expect(res.status).toBe(201);
    expect(res.json).toMatchObject({ title: 'New chat', mode: 'chat', comedyStyle: 'chill' });
  });

  it('requires roast opt-in for Roast Me', async () => {
    const denied = await create(alice.token, { mode: 'roast_me' });
    expect(denied.status).toBe(403);
    await call(t, 'PATCH', '/v1/me/preferences', {
      token: alice.token,
      body: { roastOptIn: true },
    });
    const ok = await create(alice.token, { mode: 'roast_me' });
    expect(ok.status).toBe(201);
    expect(ok.json.title).toBe('Roast Me');
  });

  it('paginates newest first with a stable cursor', async () => {
    const u = await devLogin(t);
    for (let i = 0; i < 5; i++) await create(u.accessToken, { title: `c${i}` });
    const p1 = await call(t, 'GET', '/v1/conversations?limit=2', { token: u.accessToken });
    expect(p1.json.items.map((c: any) => c.title)).toEqual(['c4', 'c3']);
    const p2 = await call(t, 'GET', `/v1/conversations?limit=2&cursor=${p1.json.nextCursor}`, {
      token: u.accessToken,
    });
    expect(p2.json.items.map((c: any) => c.title)).toEqual(['c2', 'c1']);
    const p3 = await call(t, 'GET', `/v1/conversations?limit=2&cursor=${p2.json.nextCursor}`, {
      token: u.accessToken,
    });
    expect(p3.json.items.map((c: any) => c.title)).toEqual(['c0']);
    expect(p3.json.nextCursor).toBeNull();
  });

  it('rejects a tampered cursor', async () => {
    const res = await call(t, 'GET', '/v1/conversations?cursor=not-a-cursor', {
      token: alice.token,
    });
    expect(res.status).toBe(400);
  });

  it('never exposes another account’s conversation', async () => {
    const mine = await create(alice.token, { title: 'secret plans' });
    const id = mine.json.id;
    for (const [method, url] of [
      ['GET', `/v1/conversations/${id}`],
      ['GET', `/v1/conversations/${id}/messages`],
      ['PATCH', `/v1/conversations/${id}`],
      ['DELETE', `/v1/conversations/${id}`],
    ] as const) {
      const res = await call(t, method, url, {
        token: bob.token,
        body: method === 'PATCH' ? { title: 'x' } : undefined,
      });
      expect(res.status, `${method} ${url}`).toBe(404);
    }
    const list = await call(t, 'GET', '/v1/conversations', { token: bob.token });
    expect(list.json.items.find((c: any) => c.id === id)).toBeUndefined();
    expect((await call(t, 'GET', `/v1/conversations/${id}`, { token: alice.token })).status).toBe(
      200,
    );
  });

  it('returns 404 for malformed ids', async () => {
    expect((await call(t, 'GET', '/v1/conversations/123', { token: alice.token })).status).toBe(
      404,
    );
  });

  it('renames and deletes, cascading messages', async () => {
    const c = await create(alice.token);
    const renamed = await call(t, 'PATCH', `/v1/conversations/${c.json.id}`, {
      token: alice.token,
      body: { title: 'Snacks' },
    });
    expect(renamed.json.title).toBe('Snacks');
    await t.db.insert(messages).values({
      conversationId: c.json.id,
      userId: alice.id,
      role: 'user',
      content: 'hello',
      status: 'completed',
    });
    expect(
      (await call(t, 'DELETE', `/v1/conversations/${c.json.id}`, { token: alice.token })).status,
    ).toBe(204);
    expect(
      (await call(t, 'GET', `/v1/conversations/${c.json.id}`, { token: alice.token })).status,
    ).toBe(404);
    expect(
      (await call(t, 'DELETE', `/v1/conversations/${c.json.id}`, { token: alice.token })).status,
    ).toBe(404);
  });

  it('pages messages backwards in chronological chunks and hides system rows', async () => {
    const c = await create(alice.token);
    const base = Date.now() - 100_000;
    await t.db.insert(messages).values([
      ...Array.from({ length: 5 }, (_, i) => ({
        conversationId: c.json.id,
        userId: alice.id,
        role: (i % 2 ? 'assistant' : 'user') as 'user' | 'assistant',
        content: `m${i}`,
        status: 'completed' as const,
        createdAt: new Date(base + i * 1000),
      })),
      {
        conversationId: c.json.id,
        userId: alice.id,
        role: 'system',
        content: 'hidden',
        status: 'completed',
        createdAt: new Date(base + 10_000),
      },
    ]);
    const p1 = await call(t, 'GET', `/v1/conversations/${c.json.id}/messages?limit=3`, {
      token: alice.token,
    });
    expect(p1.json.items.map((m: any) => m.content)).toEqual(['m2', 'm3', 'm4']);
    const p2 = await call(
      t,
      'GET',
      `/v1/conversations/${c.json.id}/messages?limit=3&cursor=${p1.json.nextCursor}`,
      {
        token: alice.token,
      },
    );
    expect(p2.json.items.map((m: any) => m.content)).toEqual(['m0', 'm1']);
    expect(p2.json.nextCursor).toBeNull();
  });
});
