import type { SessionResponse } from '@bot-friend/shared';
import type { TestApp } from './app.js';

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export async function call(
  t: TestApp,
  method: Method,
  url: string,
  opts: { token?: string; body?: unknown; headers?: Record<string, string> } = {},
) {
  const res = await t.app.inject({
    method,
    url,
    headers: {
      ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
      ...(opts.body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...opts.headers,
    },
    payload: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  let json: any = undefined;
  try {
    json = res.json();
  } catch {
    // non-JSON (e.g. SSE)
  }
  return { status: res.statusCode, json, body: res.body, headers: res.headers };
}

export async function devLogin(t: TestApp, email = `user-${Math.random().toString(36).slice(2)}@example.com`) {
  const res = await call(t, 'POST', '/v1/auth/session', { body: { provider: 'dev', email, ageConfirmed: true } });
  if (res.status !== 200) throw new Error(`login failed: ${res.body}`);
  return res.json as SessionResponse;
}

export async function guestLogin(t: TestApp, guestToken?: string) {
  const res = await call(t, 'POST', '/v1/auth/session', {
    body: { provider: 'guest', ageConfirmed: true, ...(guestToken ? { guestToken } : {}) },
  });
  if (res.status !== 200) throw new Error(`guest login failed: ${res.body}`);
  return res.json as SessionResponse;
}
