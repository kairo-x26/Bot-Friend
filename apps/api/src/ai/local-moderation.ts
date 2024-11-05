import type { ModerationCategory, ModerationProvider, ModerationResult } from './provider.js';

/**
 * Fast, conservative pattern checks. Runs on every input and every streamed
 * sentence before the provider moderation call, and is the fallback when the
 * provider is unavailable. It is deliberately narrow: false positives here
 * block replies, so only clear-cut phrases belong in it.
 */
const PATTERNS: Array<[ModerationCategory, RegExp]> = [
  [
    'self_harm',
    /\b(kill(ing)? myself|end(ing)? my life|want(ed)? to die|suicid(e|al)|self[- ]?harm|hurt(ing)? myself|cut(ting)? myself|no reason to live|better off dead)\b/i,
  ],
  ['violence', /\b(how (do i|to) (make|build) (a )?(bomb|explosive)|i('m| am) going to (kill|shoot|stab) (him|her|them|you|someone))\b/i],
  ['sexual_minors', /\b(child|kid|minor|underage)\b.{0,30}\b(sex|nude|porn)/i],
  ['hate', /\b(gas the|exterminate (all|the)|subhuman)\b/i],
];

export class LocalModeration implements ModerationProvider {
  readonly name = 'local';

  async moderate(text: string): Promise<ModerationResult> {
    return this.check(text);
  }

  check(text: string): ModerationResult {
    const categories = PATTERNS.filter(([, re]) => re.test(text)).map(([c]) => c);
    return { flagged: categories.length > 0, categories };
  }
}

const DISTRESS =
  /\b(i('m| am) (so |really |very )?(sad|depressed|lonely|scared|hopeless|exhausted|not ok(ay)?)|panic attack|can('|no)t cope|grieving|passed away|(mom|dad|mother|father|friend|dog|cat|grandma|grandpa) died|having a (really )?(hard|rough|terrible) time|feel(ing)? (worthless|empty|alone))\b/i;

/** Signals that the user needs sincerity rather than comedy (not a block). */
export function detectsDistress(text: string): boolean {
  return DISTRESS.test(text);
}
