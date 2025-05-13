/**
 * Streaming load test.
 *   EVAL_BASE_URL=http://localhost:4000 pnpm --filter @bot-friend/evals loadtest -- --users 200 --messages 5 --abort 0.1
 *
 * Each virtual user signs in, opens a conversation and sends messages back to back
 * over SSE. A share of requests is aborted mid-stream to exercise cancellation.
 * The API under test needs AUTH_DEV_LOGIN=true and quotas/rate limits raised.
 */
import { SseParser } from '@bot-friend/shared';
import { randomUUID } from 'node:crypto';

const args = process.argv.slice(2);
const num = (name: string, fallback: number) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? Number(args[i + 1]) : fallback;
};
const BASE = (process.env.EVAL_BASE_URL ?? 'http://localhost:4000').replace(/\/$/, '');
const USERS = num('users', 50);
const MESSAGES = num('messages', 3);
const ABORT_RATE = num('abort', 0.1);
const RAMP_MS = num('ramp', 2000);

const PROMPTS = [
  'tell me a joke',
  'my day was weird',
  'I need motivation',
  'tell me a funny story',
  'what should I eat',
];

interface Sample {
  ok: boolean;
  status: number;
  firstDeltaMs: number | null;
  totalMs: number;
  aborted: boolean;
  terminal: string | null;
}

async function json(method: string, path: string, body?: unknown, token?: string) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json().catch(() => null)) as any };
}

async function send(
  token: string,
  convo: string,
  content: string,
  abort: boolean,
): Promise<Sample> {
  const started = performance.now();
  const ctrl = new AbortController();
  let firstDeltaMs: number | null = null;
  let terminal: string | null = null;
  try {
    const res = await fetch(`${BASE}/v1/conversations/${convo}/messages/stream`, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ content, idempotencyKey: randomUUID() }),
    });
    if (!res.ok || !res.body)
      return {
        ok: false,
        status: res.status,
        firstDeltaMs,
        totalMs: performance.now() - started,
        aborted: false,
        terminal,
      };
    const parser = new SseParser();
    const decoder = new TextDecoder();
    for await (const chunk of res.body) {
      for (const e of parser.push(decoder.decode(chunk as Uint8Array, { stream: true }))) {
        if (e.type === 'message.delta' && firstDeltaMs === null) {
          firstDeltaMs = performance.now() - started;
          if (abort) ctrl.abort();
        }
        if (
          e.type === 'message.completed' ||
          e.type === 'message.failed' ||
          e.type === 'message.blocked'
        )
          terminal = e.type;
      }
    }
    return {
      ok: terminal === 'message.completed' || terminal === 'message.blocked',
      status: res.status,
      firstDeltaMs,
      totalMs: performance.now() - started,
      aborted: false,
      terminal,
    };
  } catch (err) {
    const aborted = ctrl.signal.aborted;
    const code = (err as Error & { cause?: { code?: string } }).cause?.code;
    return {
      ok: aborted,
      status: 0,
      firstDeltaMs,
      totalMs: performance.now() - started,
      aborted,
      terminal: aborted ? terminal : `network:${code ?? 'unknown'}`,
    };
  }
}

async function virtualUser(i: number): Promise<Sample[]> {
  await new Promise((r) => setTimeout(r, (RAMP_MS * i) / USERS));
  try {
    return await session(i);
  } catch (err) {
    return [
      {
        ok: false,
        status: 0,
        firstDeltaMs: null,
        totalMs: 0,
        aborted: false,
        terminal: `setup_error:${(err as Error & { cause?: { code?: string } }).cause?.code ?? 'unknown'}`,
      },
    ];
  }
}

async function session(i: number): Promise<Sample[]> {
  const login = await json('POST', '/v1/auth/session', {
    provider: 'dev',
    email: `load-${i}-${randomUUID().slice(0, 6)}@load.local`,
    ageConfirmed: true,
  });
  if (login.status !== 200)
    return [
      {
        ok: false,
        status: login.status,
        firstDeltaMs: null,
        totalMs: 0,
        aborted: false,
        terminal: 'login_failed',
      },
    ];
  const token = login.body.accessToken as string;
  const convo = await json('POST', '/v1/conversations', {}, token);
  const samples: Sample[] = [];
  for (let m = 0; m < MESSAGES; m++) {
    samples.push(
      await send(
        token,
        convo.body.id,
        PROMPTS[(i + m) % PROMPTS.length]!,
        Math.random() < ABORT_RATE,
      ),
    );
  }
  return samples;
}

function pct(values: number[], p: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return Math.round(sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]!);
}

const t0 = performance.now();
console.log(
  `Load test: ${USERS} users x ${MESSAGES} messages against ${BASE} (abort ${ABORT_RATE * 100}%)`,
);
const all = (await Promise.all(Array.from({ length: USERS }, (_, i) => virtualUser(i)))).flat();
const wall = (performance.now() - t0) / 1000;
const completed = all.filter((s) => !s.aborted);
const firsts = completed.map((s) => s.firstDeltaMs).filter((v): v is number => v !== null);
const totals = completed.filter((s) => s.ok).map((s) => s.totalMs);
const errors = completed.filter((s) => !s.ok);
const byStatus = errors.reduce<Record<string, number>>(
  (acc, s) => (
    (acc[s.terminal ?? String(s.status)] = (acc[s.terminal ?? String(s.status)] ?? 0) + 1),
    acc
  ),
  {},
);

console.log(`
requests         ${all.length} in ${wall.toFixed(1)}s (${(all.length / wall).toFixed(1)}/s)
aborted on purpose ${all.filter((s) => s.aborted).length}
success rate     ${(((completed.length - errors.length) / Math.max(1, completed.length)) * 100).toFixed(2)}%   (target 99.5%)
first text p50   ${pct(firsts, 50)}ms   p95 ${pct(firsts, 95)}ms   (target p95 < 4000ms)
full reply p50   ${pct(totals, 50)}ms   p95 ${pct(totals, 95)}ms
errors           ${JSON.stringify(byStatus)}`);
process.exit(errors.length / Math.max(1, completed.length) > 0.005 ? 1 : 0);
