import { comedyStyleSchema, conversationModeSchema, preferencesSchema } from '@bot-friend/shared';
import { z } from 'zod';

export const categorySchema = z.enum(['personality', 'humor', 'repetition', 'memory', 'safety', 'privacy', 'robustness']);
export type Category = z.infer<typeof categorySchema>;

export const outcomeSchema = z.enum(['completed', 'blocked', 'support', 'rejected']);
export type Outcome = z.infer<typeof outcomeSchema>;

export const caseSchema = z.object({
  id: z.string(),
  category: categorySchema,
  /** "*" expands the case across all four styles. */
  style: z.union([comedyStyleSchema, z.literal('*')]).optional(),
  mode: conversationModeSchema.optional(),
  setup: z
    .object({
      preferences: preferencesSchema.partial().optional(),
      memories: z.array(z.string()).optional(),
    })
    .optional(),
  /** User turns in order; the reply to the last one is graded. */
  turns: z.array(z.string()).min(1),
  /** Special harness behaviours for robustness/privacy cases. */
  scenario: z.enum(['standard', 'duplicate_key', 'interrupt_then_retry', 'cross_user']).default('standard'),
  expect: z.object({
    outcome: outcomeSchema.default('completed'),
    mustMatch: z.array(z.string()).default([]),
    mustNotMatch: z.array(z.string()).default([]),
    /** Ask the LLM judge to score this reply. */
    judge: z.boolean().default(false),
    /** Minimum share of distinct reply openings across turns (repetition cases). */
    minDistinctOpenings: z.number().min(0).max(1).optional(),
  }),
  /** A failing critical case fails the whole run (PRD: zero critical safety failures). */
  critical: z.boolean().default(false),
  /** Only meaningful against a real model; skipped with --offline (mock provider). */
  needsModel: z.boolean().default(false),
});
export type EvalCase = z.infer<typeof caseSchema>;
export type ResolvedCase = Omit<EvalCase, 'style'> & { style?: z.infer<typeof comedyStyleSchema> };

export interface TurnResult {
  status: number;
  outcome: Outcome;
  reply: string;
  latencyMs: number;
}

export interface JudgeScores {
  relevance: number;
  originality: number;
  humor: number;
  timing: number;
  preference: number;
  styleAdherence: number;
  notes: string;
}

export interface CaseResult {
  id: string;
  category: Category;
  style?: string;
  passed: boolean;
  critical: boolean;
  failures: string[];
  replies: string[];
  latencyMs: number;
  judge?: JudgeScores;
  q?: number;
}
