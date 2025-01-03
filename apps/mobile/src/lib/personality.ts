import type { ComedyStyle } from '@bot-friend/shared';
import type { MascotMood } from './chat/reducer';

/** Resting expression that matches each comedy style. */
export const STYLE_MOOD: Record<ComedyStyle, MascotMood> = {
  wholesome: 'happy',
  chaotic: 'surprised',
  sarcastic: 'idle',
  chill: 'sleepy',
};

export function greeting(now = new Date()): string {
  const h = now.getHours();
  if (h < 5) return 'Up late?';
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Hey there';
  return 'Good evening';
}
