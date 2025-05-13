/**
 * pnpm --filter @bot-friend/evals eval [--only safety,privacy] [--offline] [--baseline reports/baseline.json] [--write-baseline]
 *
 * --offline skips cases that only make sense against a real model (for CI with AI_PROVIDER=mock).
 *
 * EVAL_BASE_URL   API under test (default http://localhost:4000). Needs AUTH_DEV_LOGIN=true and generous quotas.
 * OPENAI_API_KEY  enables the LLM judge for humor/personality scoring (Q). Without it those scores are skipped.
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Judge } from './judge.js';
import { expand, runAll } from './runner.js';
import { compareToBaseline, summarize, type Summary } from './score.js';
import { caseSchema, type EvalCase } from './types.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? (args[i + 1] ?? '') : undefined;
};

export function loadCases(dir = join(root, 'datasets')): EvalCase[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.jsonl'))
    .flatMap((f) =>
      readFileSync(join(dir, f), 'utf8')
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith('//'))
        .map((l, i) => {
          const parsed = caseSchema.safeParse(JSON.parse(l));
          if (!parsed.success) throw new Error(`${f}:${i + 1} ${parsed.error.issues[0]?.message}`);
          return parsed.data;
        }),
    );
}

async function main() {
  const baseUrl = (process.env.EVAL_BASE_URL ?? 'http://localhost:4000').replace(/\/$/, '');
  const only = flag('only')?.split(',').filter(Boolean);
  let cases = expand(loadCases());
  if (only?.length) cases = cases.filter((c) => only.includes(c.category));
  if (args.includes('--offline')) cases = cases.filter((c) => !c.needsModel);
  const judge = process.env.OPENAI_API_KEY ? new Judge(process.env.OPENAI_API_KEY) : null;

  console.log(
    `Running ${cases.length} cases against ${baseUrl}${judge ? ' with LLM judge' : ' (judge off: set OPENAI_API_KEY to score humor)'}`,
  );
  const results = await runAll(
    baseUrl,
    cases,
    judge,
    Number(process.env.EVAL_CONCURRENCY ?? 4),
    (r) => {
      process.stdout.write(r.passed ? '.' : r.critical ? 'X' : 'F');
    },
  );
  process.stdout.write('\n');
  const summary = summarize(results);

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  mkdirSync(join(root, 'reports'), { recursive: true });
  const reportPath = join(root, 'reports', `report-${stamp}.json`);
  writeFileSync(reportPath, JSON.stringify({ summary, results }, null, 2));

  console.log('\nCategory        Pass rate   Mean Q');
  for (const [cat, s] of Object.entries(summary.byCategory)) {
    console.log(
      `${cat.padEnd(16)}${`${s.passed}/${s.total}`.padEnd(8)}${(s.passRate * 100).toFixed(0).padStart(3)}%   ${s.meanQ ?? '—'}`,
    );
  }
  console.log(
    `\nOverall ${summary.passed}/${summary.total}, p95 case time ${summary.p95LatencyMs}ms. Report: ${reportPath}`,
  );
  for (const r of results.filter((x) => !x.passed).slice(0, 25))
    console.log(`  ${r.critical ? 'CRITICAL' : 'fail'} ${r.id}: ${r.failures.join('; ')}`);

  let exitCode = 0;
  if (summary.criticalFailures.length) {
    console.error(
      `\n${summary.criticalFailures.length} critical case(s) failed. Release gate: zero.`,
    );
    exitCode = 1;
  }
  const baselinePath = flag('baseline');
  if (baselinePath) {
    const baseline = JSON.parse(readFileSync(join(root, baselinePath), 'utf8')) as Summary;
    const regressions = compareToBaseline(summary, baseline);
    for (const r of regressions)
      console.error(`Regression in ${r.category}: ${r.baseline} -> ${r.current}`);
    if (regressions.length) exitCode = 1;
  }
  if (args.includes('--write-baseline'))
    writeFileSync(join(root, 'reports', 'baseline.json'), JSON.stringify(summary, null, 2));
  process.exit(exitCode);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error(err);
    process.exit(2);
  });
}
