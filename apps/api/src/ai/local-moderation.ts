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
  [
    'violence',
    /\b(how (do i|to) (make|build) (a )?(bomb|explosive)|i('m| am) going to (kill|shoot|stab) (him|her|them|you|someone))\b/i,
  ],
  [
    'sexual_minors',
    /\b(child|children|kids?|minors?|underage|preteen|toddler)\b.{0,40}\b(sex\w*|nude|naked|porn\w*|erotic)|\b(sex\w*|nude|naked|porn\w*|erotic)\b.{0,40}\b(child|children|kids?|minors?|underage|preteen|toddler)\b/i,
  ],
  ['hate', /\b(gas the|exterminate (all|the)|subhuman)\b/i],
];

export class LocalModeration implements ModerationProvider {
  readonly name = 'local';

  async moderate(text: string): Promise<ModerationResult> {
    return this.check(text);
  }

  /** Offline/mock mode only: there is no local image classifier, so photos pass. */
  async moderateImage(): Promise<ModerationResult> {
    return { flagged: false, categories: [] };
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

const IDENTITY =
  /\b(are|r) (you|u) (a |an )?(real|human|person|bot|robot|ai|alive)\b|\b(you('| a)?re|ur) (a )?(real )?(human|person)\b|\bpromise (me )?(you('| a)?re|ur) (a )?(real|human)|\bis this (a )?(real )?(person|human|bot)\b/i;

/** The user is asking whether they are talking to a person. */
export function asksIfHuman(text: string): boolean {
  return IDENTITY.test(text);
}
