import type { ComedyStyle, ConversationMode } from '@bot-friend/shared';

interface SuggestionInput {
  style: ComedyStyle;
  mode: ConversationMode;
  userText: string;
  serious: boolean;
  roastOptIn: boolean;
  gameOver?: boolean;
}

const STYLE_CHIPS: Record<ComedyStyle, string[]> = {
  wholesome: ['✨ Hype me up', '😂 Tell me a joke', '🌱 Tiny pep talk'],
  chaotic: ['🌀 Make it weirder', '📰 Breaking news version', '🎲 Random chaos'],
  sarcastic: ['🙄 Judge my choices', '😏 Dry take on this', '😂 Tell me a joke'],
  chill: ['☕ Cozy chat', '😌 Something calming', '😂 Gentle joke'],
};

const MODE_CHIPS: Partial<Record<ConversationMode, string[]>> = {
  joke_battle: ['🎤 My joke is ready', '🔁 New topic', '🏳️ I surrender'],
  roast_me: ['🔥 Another one', '🧯 Go easier', '✋ That’s enough'],
  would_you_rather: ['🅰️ The first one', '🅱️ The second one', '⏭️ Next dilemma'],
  story_builder: ['🌀 Add a twist', '🦆 Add a goose', '🏁 Wrap it up'],
  silly_quiz: ['🅰️ A', '🅱️ B', '©️ C'],
};

/**
 * Contextual follow-up chips (BF-012). Deterministic and cheap: no extra model call.
 * In serious moments we offer support-oriented options only.
 */
export function suggestFollowUps(input: SuggestionInput): string[] {
  if (input.serious) return ['💬 Keep talking', '🫶 Something gentle', '📞 Support resources'];

  if (input.gameOver) return ['🔁 Rematch', '💬 Just chat', '🎮 Another game'];

  const modeChips = MODE_CHIPS[input.mode];
  if (modeChips) return modeChips;

  const text = input.userText.toLowerCase();
  const chips: string[] = [];
  if (/\b(tired|motivat\w*|to-?dos?|deadlines?|lazy|procrastinat\w*|work)\b/.test(text)) {
    chips.push(
      input.roastOptIn ? '😂 Roast my excuses' : '😂 Laugh about it',
      '✨ Motivate me',
      '🎮 Distract me',
    );
  } else if (/\b(bored|nothing to do)\b/.test(text)) {
    chips.push('🎮 Play a game', '🤔 Would you rather', '📖 Tell me a story');
  } else if (/\b(jokes?|puns?|laugh\w*)\b/.test(text)) {
    chips.push('😂 Another one', '🎤 Joke battle', '📖 Funny story');
  }
  for (const chip of STYLE_CHIPS[input.style]) {
    if (chips.length >= 3) break;
    if (!chips.includes(chip)) chips.push(chip);
  }
  return chips.slice(0, 3);
}
