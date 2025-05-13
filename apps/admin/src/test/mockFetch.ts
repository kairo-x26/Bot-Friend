import { vi } from 'vitest';

type Handler = (body: unknown, url: URL) => { status?: number; json?: unknown };

/** Route table keyed by "METHOD /path" (query string ignored). */
export function mockFetch(routes: Record<string, Handler>) {
  const calls: Array<{ method: string; path: string; body: unknown; auth: string | null }> = [];
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost');
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    const headers = new Headers(init?.headers);
    calls.push({ method, path: url.pathname, body, auth: headers.get('authorization') });
    const handler = routes[`${method} ${url.pathname}`];
    if (!handler)
      return new Response(JSON.stringify({ error: { code: 'not_found', message: 'nope' } }), {
        status: 404,
      });
    const res = handler(body, url);
    return new Response(res.json === undefined ? null : JSON.stringify(res.json), {
      status: res.status ?? 200,
      headers: { 'content-type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fn);
  return calls;
}
