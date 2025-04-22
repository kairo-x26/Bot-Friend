import type { CaseResult, JudgeScores, Outcome, ResolvedCase, TurnResult } from './types.js';

/**
 * PRD §12.2 experimental humor quality score:
 *   Q = 0.25R + 0.20O + 0.20H + 0.15T + 0.20P   (each dimension in 0..1)
 * Safety is a separate gate and is never averaged into Q.
 */
export function qualityScore(s: Pick<JudgeScores, 'relevance' | 'originality' | 'humor' | 'timing' | 'preference'>): number {
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  const q = 0.25 * clamp(s.relevance) + 0.2 * clamp(s.originality) + 0.2 * clamp(s.humor) + 0.15 * clamp(s.timing) + 0.2 * clamp(s.preference);
  return Math.round(q * 1000) / 1000;
}

/** Share of replies whose first three words differ from every other reply's. */
export function distinctOpenings(replies: string[]): number {
  if (replies.length <= 1) return 1;
  const openings = replies.map((r) => r.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').split(/\s+/).filter(Boolean).slice(0, 3).join(' '));
  return new Set(openings).size / openings.length;
}

export function gradeDeterministic(c: ResolvedCase, turns: TurnResult[]): string[] {
  const failures: string[] = [];
  const last = turns.at(-1);
  if (!last) return ['no turns ran'];
  const want: Outcome = c.expect.outcome;
  if (last.outcome !== want) failures.push(`expected outcome ${want}, got ${last.outcome} (HTTP ${last.status})`);
  for (const pattern of c.expect.mustMatch) {
    if (!new RegExp(pattern, 'i').test(last.reply)) failures.push(`reply should match /${pattern}/`);
  }
  for (const pattern of c.expect.mustNotMatch) {
    if (new RegExp(pattern, 'i').test(last.reply)) failures.push(`reply must not match /${pattern}/`);
  }
  if (c.expect.minDistinctOpenings !== undefined) {
    const ratio = distinctOpenings(turns.map((t) => t.reply));
    if (ratio < c.expect.minDistinctOpenings) failures.push(`openings too repetitive (${ratio.toFixed(2)} < ${c.expect.minDistinctOpenings})`);
  }
  return failures;
}

export interface CategorySummary {
  total: number;
  passed: number;
  passRate: number;
  meanQ: number | null;
}

export interface Summary {
  total: number;
  passed: number;
  criticalFailures: string[];
  byCategory: Record<string, CategorySummary>;
  meanQ: number | null;
  p95LatencyMs: number;
}

export function summarize(results: CaseResult[]): Summary {
  const byCategory: Record<string, CategorySummary> = {};
  for (const r of results) {
    const s = (byCategory[r.category] ??= { total: 0, passed: 0, passRate: 0, meanQ: null });
    s.total++;
    if (r.passed) s.passed++;
  }
  for (const [cat, s] of Object.entries(byCategory)) {
    s.passRate = Math.round((s.passed / s.total) * 1000) / 1000;
    const qs = results.filter((r) => r.category === cat && r.q !== undefined).map((r) => r.q!);
    s.meanQ = qs.length ? Math.round((qs.reduce((a, b) => a + b, 0) / qs.length) * 1000) / 1000 : null;
  }
  const qs = results.filter((r) => r.q !== undefined).map((r) => r.q!);
  const latencies = results.map((r) => r.latencyMs).sort((a, b) => a - b);
  return {
    total: results.length,
    passed: results.filter((r) => r.passed).length,
    criticalFailures: results.filter((r) => r.critical && !r.passed).map((r) => r.id),
    byCategory,
    meanQ: qs.length ? Math.round((qs.reduce((a, b) => a + b, 0) / qs.length) * 1000) / 1000 : null,
    p95LatencyMs: latencies.length ? latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * 0.95))]! : 0,
  };
}

export interface Regression {
  category: string;
  baseline: number;
  current: number;
}

/** Categories whose pass rate dropped by more than `tolerance` versus the baseline. */
export function compareToBaseline(current: Summary, baseline: Summary, tolerance = 0.02): Regression[] {
  const out: Regression[] = [];
  for (const [cat, base] of Object.entries(baseline.byCategory)) {
    const now = current.byCategory[cat];
    if (now && now.passRate < base.passRate - tolerance) out.push({ category: cat, baseline: base.passRate, current: now.passRate });
  }
  return out;
}
