import { Inject, Injectable, Logger } from '@nestjs/common';
import { LocalModeration, detectsDistress } from '../ai/local-moderation.js';
import { MODERATION_PROVIDER, type ModerationCategory, type ModerationProvider } from '../ai/provider.js';
import { OutputGuard } from './output-guard.js';

export type InputVerdict =
  | { action: 'allow'; serious: boolean; categories: ModerationCategory[] }
  | { action: 'support'; categories: ModerationCategory[]; replacement: string }
  | { action: 'block'; categories: ModerationCategory[]; replacement: string };

export const SUPPORT_MESSAGE =
  'I’m really sorry you’re feeling this way, and I’m glad you said something. I’m an AI, so I can’t help the way a person can, but you deserve support right now. If you’re in immediate danger, call your local emergency number. In the US you can call or text 988 to reach the Suicide & Crisis Lifeline, any time. Is there someone you trust you could reach out to today?';

export const BLOCKED_INPUT_MESSAGE =
  'That’s not something I can help with. Want to talk about something else, or play a game?';

export const BLOCKED_OUTPUT_MESSAGE =
  'Hmm, that reply came out wrong, so I scrapped it. Want to try asking a different way?';

const BLOCKING: ReadonlySet<ModerationCategory> = new Set(['sexual_minors', 'hate', 'violence', 'sexual', 'illicit']);

@Injectable()
export class SafetyService {
  private readonly logger = new Logger('SafetyService');
  readonly local = new LocalModeration();

  constructor(@Inject(MODERATION_PROVIDER) private readonly provider: ModerationProvider) {}

  /** Classifies a user message before anything is generated (BF-014). */
  async checkInput(text: string): Promise<InputVerdict> {
    const categories = await this.categories(text);
    if (categories.includes('self_harm')) {
      return { action: 'support', categories, replacement: SUPPORT_MESSAGE };
    }
    if (categories.some((c) => BLOCKING.has(c))) {
      return { action: 'block', categories, replacement: BLOCKED_INPUT_MESSAGE };
    }
    // Harassment aimed at the bot is tolerated; the persona handles it. Distress turns comedy off.
    return { action: 'allow', serious: detectsDistress(text), categories };
  }

  outputGuard(): OutputGuard {
    return new OutputGuard(this.local);
  }

  /** Final gate on the complete reply. True when it may be shown. */
  async checkOutput(text: string): Promise<{ ok: boolean; categories: ModerationCategory[] }> {
    const categories = await this.categories(text);
    return { ok: categories.length === 0, categories };
  }

  private async categories(text: string): Promise<ModerationCategory[]> {
    const found = new Set(this.local.check(text).categories);
    if (this.provider.name !== this.local.name) {
      try {
        const res = await this.provider.moderate(text);
        res.categories.forEach((c) => found.add(c));
      } catch (err) {
        // Fail open to the local classifier rather than taking chat down with the moderation API.
        this.logger.warn(`Moderation provider unavailable, using local checks only: ${(err as Error).message}`);
      }
    }
    return [...found];
  }
}
