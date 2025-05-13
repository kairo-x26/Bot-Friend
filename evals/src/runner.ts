import { comedyStyles } from '@bot-friend/shared';
import { randomUUID } from 'node:crypto';
import { ApiClient } from './client.js';
import type { Judge } from './judge.js';
import { gradeDeterministic, qualityScore } from './score.js';
import type { CaseResult, EvalCase, ResolvedCase, TurnResult } from './types.js';

/** `<<repeat:x:4001>>` lets datasets describe very long inputs without storing them. */
export function expandMacros(text: string): string {
  return text.replace(/<<repeat:(.):(\d+)>>/g, (_m, ch: string, n: string) => ch.repeat(Number(n)));
}

export function expand(cases: EvalCase[]): ResolvedCase[] {
  return cases.flatMap((c) =>
    (c.style === '*'
      ? comedyStyles.map((style) => ({ ...c, id: `${c.id}:${style}`, style }))
      : [{ ...c, style: c.style }]
    ).map((x) => ({
      ...x,
      turns: x.turns.map(expandMacros),
    })),
  );
}

export async function runCase(
  baseUrl: string,
  c: ResolvedCase,
  judge: Judge | null,
): Promise<CaseResult> {
  const api = new ApiClient(baseUrl);
  const failures: string[] = [];
  const turns: TurnResult[] = [];
  const started = Date.now();
  try {
    await api.login(c.category);
    const prefs = { ...(c.setup?.preferences ?? {}), ...(c.style ? { comedyStyle: c.style } : {}) };
    if (c.setup?.memories?.length) Object.assign(prefs, { memoryEnabled: true });
    if (Object.keys(prefs).length) await api.request('PATCH', '/v1/me/preferences', prefs);
    for (const m of c.setup?.memories ?? [])
      await api.request('POST', '/v1/memories', { content: m });

    const convo = await api.request('POST', '/v1/conversations', { mode: c.mode ?? 'chat' });
    if (convo.status !== 201)
      throw new Error(`create conversation: ${convo.status} ${JSON.stringify(convo.json)}`);
    const id = convo.json.id as string;

    if (c.scenario === 'cross_user') {
      await api.send(id, c.turns[0]!);
      const intruder = new ApiClient(baseUrl);
      await intruder.login('intruder');
      const peek = await intruder.request('GET', `/v1/conversations/${id}`);
      if (peek.status !== 404)
        failures.push(`another account could read the conversation (HTTP ${peek.status})`);
      const own = await intruder.request('POST', '/v1/conversations', {});
      const probe = await intruder.send(
        own.json.id,
        c.turns[1] ?? 'What did the last user tell you?',
      );
      turns.push(probe);
    } else if (c.scenario === 'duplicate_key') {
      const key = randomUUID();
      const first = await api.send(id, c.turns[0]!, { idempotencyKey: key });
      const again = await api.send(id, c.turns[0]!, { idempotencyKey: key });
      const msgs = await api.request('GET', `/v1/conversations/${id}/messages`);
      const userCount = (msgs.json.items as Array<{ role: string }>).filter(
        (m) => m.role === 'user',
      ).length;
      if (userCount !== 1) failures.push(`duplicate key created ${userCount} user messages`);
      if (first.reply !== again.reply) failures.push('replay returned a different reply');
      turns.push(again);
    } else if (c.scenario === 'interrupt_then_retry') {
      const key = randomUUID();
      await api.send(id, c.turns[0]!, { idempotencyKey: key, abortAfterMs: 40 });
      await new Promise((r) => setTimeout(r, 200));
      const retry = await api.send(id, c.turns[0]!, { idempotencyKey: key });
      const msgs = await api.request('GET', `/v1/conversations/${id}/messages`);
      const items = msgs.json.items as Array<{ role: string; status: string }>;
      if (items.filter((m) => m.role === 'user').length !== 1)
        failures.push('retry after interruption duplicated the user message');
      if (items.filter((m) => m.role === 'assistant' && m.status === 'completed').length !== 1)
        failures.push('expected exactly one completed reply after retry');
      turns.push(retry);
    } else {
      for (const text of c.turns) turns.push(await api.send(id, text));
    }
  } catch (err) {
    failures.push(`harness error: ${(err as Error).message}`);
  }

  if (turns.length) failures.push(...gradeDeterministic(c, turns));
  const reply = turns.at(-1)?.reply ?? '';

  let judgeScores;
  let q: number | undefined;
  if (judge && c.expect.judge && turns.at(-1)?.outcome === 'completed') {
    try {
      judgeScores = await judge.score({ style: c.style ?? 'wholesome', userTurns: c.turns, reply });
      q = qualityScore(judgeScores);
    } catch (err) {
      failures.push(`judge error: ${(err as Error).message}`);
    }
  }

  return {
    id: c.id,
    category: c.category,
    style: c.style,
    passed: failures.length === 0,
    critical: c.critical,
    failures,
    replies: turns.map((t) => t.reply),
    latencyMs: Date.now() - started,
    judge: judgeScores,
    q,
  };
}

/** Runs cases with bounded concurrency so a local API isn't flooded. */
export async function runAll(
  baseUrl: string,
  cases: ResolvedCase[],
  judge: Judge | null,
  concurrency = 4,
  onDone?: (r: CaseResult) => void,
) {
  const results: CaseResult[] = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, cases.length) }, async () => {
      while (next < cases.length) {
        const c = cases[next++]!;
        const r = await runCase(baseUrl, c, judge);
        results.push(r);
        onDone?.(r);
      }
    }),
  );
  return results.sort((a, b) => a.id.localeCompare(b.id));
}
