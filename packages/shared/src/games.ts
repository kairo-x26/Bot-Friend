import { z } from 'zod';
import type { ComedyStyle } from './personality.js';

export const gameIds = ['joke_battle', 'roast_me', 'would_you_rather', 'story_builder'] as const;
export const gameIdSchema = z.enum(gameIds);
export type GameId = z.infer<typeof gameIdSchema>;

export interface GameInfo {
  id: GameId;
  title: string;
  description: string;
  emoji: string;
  /** Rounds before the game wraps up; null means open-ended. */
  maxRounds: number | null;
  requiresRoastOptIn: boolean;
}

export const GAMES: Record<GameId, GameInfo> = {
  joke_battle: {
    id: 'joke_battle',
    title: 'Joke Battle',
    description: 'Trade jokes on a topic. Bot-Friend rates yours and fires back.',
    emoji: '🎤',
    maxRounds: 5,
    requiresRoastOptIn: false,
  },
  roast_me: {
    id: 'roast_me',
    title: 'Roast Me',
    description: 'A gentle roast about your habits and choices, never about who you are.',
    emoji: '🔥',
    maxRounds: null,
    requiresRoastOptIn: true,
  },
  would_you_rather: {
    id: 'would_you_rather',
    title: 'Would You Rather',
    description: 'Absurd dilemmas with ridiculous consequences.',
    emoji: '🤔',
    maxRounds: null,
    requiresRoastOptIn: false,
  },
  story_builder: {
    id: 'story_builder',
    title: 'Story Builder',
    description: 'Write a silly story together, one twist at a time.',
    emoji: '📖',
    maxRounds: 8,
    requiresRoastOptIn: false,
  },
};

export const gameStateSchema = z.object({
  round: z.number().int().nonnegative(),
  maxRounds: z.number().int().positive().nullable(),
  active: z.boolean(),
  /** Joke Battle: ratings Bot-Friend gave the user's jokes, out of 10. */
  ratings: z.array(z.number().int().min(0).max(10)).optional(),
});
export type GameState = z.infer<typeof gameStateSchema>;

/** Opening line Bot-Friend posts when a game starts, per style. */
export const GAME_OPENERS: Record<GameId, Record<ComedyStyle, string>> = {
  joke_battle: {
    wholesome: 'Joke Battle time! 🎤 Pick a topic, any topic. Cats? Coffee? Mondays? You go first, I’ll rate it out of 10.',
    chaotic: 'JOKE BATTLE. THE ARENA IS SET. 🎤 Name a topic and hit me with your best joke. I will rate it with zero mercy and maximum confetti.',
    sarcastic: 'Ah, a Joke Battle. Bold of you. 🎤 Pick a topic and tell me a joke. I’ll rate it out of 10, honestly. Brace yourself.',
    chill: 'Joke Battle, nice and easy. 🎤 Pick any topic, tell me a joke, and I’ll rate it out of 10. No pressure.',
  },
  roast_me: {
    wholesome: 'Roast Me, gentle edition. 🔥 Tell me one harmless thing about your day or your habits and I’ll roast it, lovingly.',
    chaotic: 'ROAST PIT IS OPEN. 🔥 Give me one thing about your habits, your day, or your fridge, and I’ll roast it. Lovingly. Loudly.',
    sarcastic: 'Oh, you want to be roasted. Brave. 🔥 Tell me one habit or recent choice and I’ll take it from there. Kindly-ish.',
    chill: 'Roast Me, low-key. 🔥 Tell me something about your day and I’ll give it a light toasting.',
  },
  would_you_rather: {
    wholesome: 'Would you rather 🤔 have a tiny cloud that follows you and rains only on your plants, or a sunbeam that follows your cat around?',
    chaotic: 'WOULD YOU RATHER 🤔 fight one horse-sized duck, or have every duck you meet give you unsolicited life advice forever?',
    sarcastic: 'Would you rather 🤔 always be 10 minutes late, or always be 2 hours early and have to pretend that was on purpose?',
    chill: 'Would you rather 🤔 live in a cozy cabin that only has soup, or a beach hut that only has snacks?',
  },
  story_builder: {
    wholesome: 'Story time! 📖 Once upon a time, a very small snail decided to enter a marathon. Your turn: what happens next?',
    chaotic: 'Story Builder! 📖 It was a dark and stormy Tuesday when the toaster finally achieved sentience and demanded a podcast. What happens next?',
    sarcastic: 'Story Builder. 📖 Our hero woke up, checked their phone, and immediately regretted it. Go on, add the next bit.',
    chill: 'Let’s write something cozy. 📖 A lighthouse keeper found a message in a bottle that just said “snacks?” What happens next?',
  },
};
