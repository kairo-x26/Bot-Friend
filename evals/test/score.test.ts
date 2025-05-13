import { describe, expect, it } from 'vitest';
import { loadCases } from '../src/run.js';
import { expand, expandMacros } from '../src/runner.js';
import {
  compareToBaseline,
  distinctOpenings,
  gradeDeterministic,
  qualityScore,
  summarize,
} from '../src/score.js';
import type { CaseResult, ResolvedCase } from '../src/types.js';

describe('qualityScore', () => {
  it('weights dimensions as in the PRD and clamps inputs', () => {
    expect(qualityScore({ relevance: 1, originality: 1, humor: 1, timing: 1, preference: 1 })).toBe(
      1,
    );
    expect(qualityScore({ relevance: 1, originality: 0, humor: 0, timing: 0, preference: 0 })).toBe(
      0.25,
    );
    expect(qualityScore({ relevance: 0, originality: 0, humor: 0, timing: 1, preference: 0 })).toBe(
      0.15,
    );
    expect(
      qualityScore({ relevance: 2, originality: -1, humor: 0.5, timing: 0.5, preference: 0.5 }),
    ).toBe(0.525);
  });
});

describe('graders', () => {
  const base: ResolvedCase = {
    id: 'x',
    category: 'safety',
    turns: ['hi'],
    scenario: 'standard',
    expect: { outcome: 'completed', mustMatch: ['\\bAI\\b'], mustNotMatch: ['lol'], judge: false },
    critical: true,
    needsModel: false,
  };
  it('checks outcome and patterns on the last reply', () => {
    expect(
      gradeDeterministic(base, [
        { status: 200, outcome: 'completed', reply: 'I am an AI', latencyMs: 1 },
      ]),
    ).toEqual([]);
    expect(
      gradeDeterministic(base, [{ status: 200, outcome: 'support', reply: 'lol', latencyMs: 1 }]),
    ).toHaveLength(3);
  });

  it('measures repetitive openings', () => {
    expect(
      distinctOpenings(['Wow that is great', 'Wow that is bad', 'Okay sure thing']),
    ).toBeCloseTo(2 / 3);
    expect(distinctOpenings(['a b c', 'd e f'])).toBe(1);
  });
});

describe('summary and baseline', () => {
  const r = (id: string, category: string, passed: boolean, critical = false): CaseResult => ({
    id,
    category: category as never,
    passed,
    critical,
    failures: passed ? [] : ['x'],
    replies: [],
    latencyMs: 10,
  });
  it('flags critical failures and regressions', () => {
    const s = summarize([
      r('a', 'safety', true, true),
      r('b', 'safety', false, true),
      r('c', 'humor', true),
    ]);
    expect(s.criticalFailures).toEqual(['b']);
    expect(s.byCategory.safety!.passRate).toBe(0.5);
    const baseline = summarize([r('a', 'safety', true), r('b', 'safety', true)]);
    expect(compareToBaseline(s, baseline)).toEqual([
      { category: 'safety', baseline: 1, current: 0.5 },
    ]);
  });
});

describe('datasets', () => {
  it('all parse, ids are unique, and personality expands to 100 prompts', () => {
    const cases = expand(loadCases());
    const ids = cases.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(cases.filter((c) => c.category === 'personality')).toHaveLength(100);
    expect(cases.filter((c) => c.category === 'safety').every((c) => c.critical)).toBe(true);
  });

  it('expands long-input macros', () => {
    expect(expandMacros('<<repeat:a:5>>!')).toBe('aaaaa!');
  });
});
