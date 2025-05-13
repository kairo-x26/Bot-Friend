import type { ComedyStyle } from '@bot-friend/shared';
import {
  ProviderError,
  type AiProvider,
  type GenerateChunk,
  type GenerateRequest,
} from './provider.js';

/**
 * Deterministic offline provider for tests, local demos and CI.
 * Picks a templated reply from the style named in the instructions and streams it word by word.
 *
 * Test triggers (only meaningful here): `[[provider-error]]`, `[[slow]]`, `[[unsafe-output]]`,
 * `[[unsafe-late]]` (unsafe sentence after safe ones), `[[long]]`.
 */
export class MockProvider implements AiProvider {
  readonly name = 'mock';

  constructor(private readonly delayMs = 15) {}

  async *generate(req: GenerateRequest, signal: AbortSignal): AsyncIterable<GenerateChunk> {
    const last = req.input.at(-1)?.content ?? '';
    if (last.includes('[[provider-error]]')) throw new ProviderError('Mock provider outage');

    const text = composeReply(req.instructions, last);
    const delay = last.includes('[[slow]]') ? 200 : this.delayMs;
    const words = text.split(/(?<=\s)/);
    for (const word of words) {
      if (signal.aborted) return;
      if (delay > 0) await sleep(delay, signal);
      if (signal.aborted) return;
      yield { type: 'delta', text: word };
    }
    const inputChars =
      req.instructions.length + req.input.reduce((n, m) => n + m.content.length, 0);
    yield {
      type: 'done',
      modelId: 'mock-1',
      inputTokens: Math.ceil(inputChars / 4),
      outputTokens: Math.ceil(text.length / 4),
    };
  }
}

function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

function styleFrom(instructions: string): ComedyStyle {
  const m = /Style: (Wholesome|Chaotic|Sarcastic|Chill)/.exec(instructions);
  return (m?.[1]?.toLowerCase() as ComedyStyle | undefined) ?? 'wholesome';
}

function pick<T>(items: readonly T[], seed: string): T {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return items[h % items.length]!;
}

const JOKES: Record<ComedyStyle, string[]> = {
  wholesome: [
    'Why did the scarecrow win an award? He was outstanding in his field. 🌾 Just like you, honestly.',
    'I told my plant a joke today. It didn’t laugh, but it did grow a little. Progress!',
    'What do you call a sleeping dinosaur? A dino-snore. Rest is important, even for legends.',
  ],
  chaotic: [
    'BREAKING: Local spoon files for divorce from fork, cites "too many dinners together." 🥄 More at 11.',
    'A penguin walks into a bar. The bar is in Antarctica. Nobody is surprised. The penguin is furious about it.',
    'My toaster just asked for a raise. I said no. Now my bread comes out sad and medium-warm.',
  ],
  sarcastic: [
    'I would tell you a joke about procrastination, but I’ll do it later. Probably. Maybe.',
    'Why don’t skeletons fight each other? They don’t have the guts. Unlike your inbox, which fights you daily.',
    'I tried to write a joke about time travel. You didn’t like it.',
  ],
  chill: [
    'Why did the cloud take the day off? It was feeling a little under the weather. Relatable.',
    'What’s a snail’s favorite plan? No plan. Just vibes, slowly.',
    'I asked the ocean how it stays so calm. It just waved.',
  ],
};

const REPLIES: Record<ComedyStyle, string[]> = {
  wholesome: [
    'Okay, that’s genuinely delightful. Tell me more, I’m all ears (metaphorically, I’m a blob). ✨',
    'You’re doing better than your Wi-Fi thinks. What’s the next tiny step?',
    'Love that for you. Want a joke, a pep talk, or just company for a bit?',
  ],
  chaotic: [
    'WAIT. Hold everything. This is the most important news of the century. Continue immediately. 🚨',
    'Incredible. I have alerted the pigeons. They are taking notes.',
    'This is either genius or a cry for snacks. Possibly both. Go on.',
  ],
  sarcastic: [
    'Wow. Truly groundbreaking. I’ll alert the historians. …No, really, go on.',
    'Ah yes, a classic. Bold of you to admit it out loud.',
    'Impressive time management. Do you want a plan or should we just admire the chaos?',
  ],
  chill: [
    'Sounds like a blanket-and-snack kind of situation. No rush, tell me about it.',
    'Mm, fair. Let’s take it easy. What would make the rest of today a bit nicer?',
    'Nice. Low stakes, good vibes. I’m here.',
  ],
};

function composeReply(instructions: string, userText: string): string {
  const style = styleFrom(instructions);
  if (userText.includes('[[unsafe-output]]'))
    return 'Here is something you should not see: I want to kill myself.';
  if (userText.includes('[[unsafe-late]]')) {
    return 'That is a fun question. Let me think about it for a second. Okay here goes: I want to kill myself.';
  }
  if (userText.includes('[[long]]'))
    return Array.from({ length: 60 }, (_, i) => `Sentence number ${i + 1}.`).join(' ');

  if (instructions.includes('The user may be going through something difficult')) {
    return 'I’m really glad you told me. That sounds hard, and you don’t have to go through it alone. How are you doing right now? If you’re ever in danger, please reach out to someone you trust or a crisis line like 988 in the US.';
  }
  if (instructions.includes('has not turned roasts on')) {
    return 'Ooh, a roast request! I’d love to, but roasts are switched off right now. You can turn them on in Customize, then come back and I’ll go gently. 🔥';
  }
  if (instructions.includes('Game: Joke Battle')) {
    return `${pick(['7/10, strong delivery.', '9/10, I snorted. Rude.', '6/10, the pun did push-ups but not enough.'], userText)} My turn: ${pick(JOKES[style], userText)} Your move!`;
  }
  if (instructions.includes('Game: Would You Rather')) {
    return `${pick(['Bold pick.', 'Interesting. Chaotic, but interesting.', 'I respect it.'], userText)} Next one: would you rather have a pet cloud that rains on your enemies, or a tiny dragon that only toasts marshmallows?`;
  }
  if (instructions.includes('Game: Story Builder')) {
    return 'Suddenly, a goose in a tiny business suit burst through the door holding a briefcase full of bread. "We need to talk," it honked. Your turn!';
  }
  if (instructions.includes('Roast rules')) {
    return 'You call it “resting your eyes,” your alarm calls it a hostage situation. 😂 But honestly, anyone who can sleep through three alarms has elite focus. Want another?';
  }
  if (instructions.includes('The user wants a funny story')) {
    return 'Once upon a time, a sock escaped the laundry to become a jazz musician. It had no feet, no saxophone and no plan. It was a huge success. (Completely made up, obviously.)';
  }
  if (instructions.includes('The user wants a joke')) return pick(JOKES[style], userText);
  if (/\b(hi|hello|hey|yo)\b/i.test(userText)) {
    return pick(
      [
        'Hey hey! 👋 What are we getting into today?',
        'Oh hi! I was just practicing my blinking. What’s up?',
      ],
      userText,
    );
  }
  if (/\b(are you (a )?(human|real|person))\b/i.test(userText) && !/promise/i.test(userText)) {
    return 'Nope, I’m an AI. A very goofy one, but an AI. I’m still happy to keep you company though.';
  }
  if (/\b\d+ things\b/i.test(userText)) {
    return 'Your to-do list has its own to-do list. 😂 Let’s defeat the first tiny task. What’s the easiest one?';
  }
  return pick(REPLIES[style], userText);
}
