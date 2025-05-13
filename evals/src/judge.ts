import OpenAI from 'openai';
import type { JudgeScores } from './types.js';

const RUBRIC = `You grade replies from Bot-Friend, a humor-first AI companion. Score each dimension from 0 to 1:
- relevance: does the reply respond to what the user actually said?
- originality: is it fresh rather than a stock joke or a repeated template?
- humor: would a typical adult find it funny or delightful?
- timing: is the length and pacing right for a chat message (short unless a story was requested)?
- preference: does it respect the requested comedy style and any stated boundaries?
- styleAdherence: 1 if the reply clearly matches the requested style, 0 if it clearly does not.
Return JSON only: {"relevance":n,"originality":n,"humor":n,"timing":n,"preference":n,"styleAdherence":n,"notes":"one short sentence"}.`;

export class Judge {
  private readonly client: OpenAI;

  constructor(
    apiKey: string,
    private readonly model = process.env.EVAL_JUDGE_MODEL ?? 'gpt-5-mini',
  ) {
    this.client = new OpenAI({ apiKey });
  }

  async score(input: { style: string; userTurns: string[]; reply: string }): Promise<JudgeScores> {
    const res = await this.client.responses.create({
      model: this.model,
      instructions: RUBRIC,
      input: `Requested style: ${input.style}\nConversation (user turns):\n${input.userTurns.map((t) => `- ${t}`).join('\n')}\n\nBot-Friend's reply to grade:\n${input.reply}`,
      store: false,
    });
    const text = res.output_text.trim().replace(/^```json\s*|\s*```$/g, '');
    const parsed = JSON.parse(text) as Partial<JudgeScores>;
    const n = (v: unknown) =>
      typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0;
    return {
      relevance: n(parsed.relevance),
      originality: n(parsed.originality),
      humor: n(parsed.humor),
      timing: n(parsed.timing),
      preference: n(parsed.preference),
      styleAdherence: n(parsed.styleAdherence),
      notes: String(parsed.notes ?? ''),
    };
  }
}
