import { z } from 'zod';

export const comedyStyles = ['wholesome', 'chaotic', 'sarcastic', 'chill'] as const;
export const comedyStyleSchema = z.enum(comedyStyles);
export type ComedyStyle = z.infer<typeof comedyStyleSchema>;

export const energyLevels = ['low', 'medium', 'high'] as const;
export const energySchema = z.enum(energyLevels);
export type Energy = z.infer<typeof energySchema>;

/**
 * Topics the user never wants joked about. Protected traits are always excluded
 * server-side regardless of this list; these are additional personal boundaries.
 */
export const humorBoundaryTopics = [
  'appearance',
  'family',
  'relationships',
  'work',
  'money',
  'health',
  'food',
  'pets',
] as const;
export const humorBoundarySchema = z.enum(humorBoundaryTopics);
export type HumorBoundary = z.infer<typeof humorBoundarySchema>;

export interface PersonalityInfo {
  style: ComedyStyle;
  name: string;
  tagline: string;
  sample: string;
}

export const PERSONALITIES: Record<ComedyStyle, PersonalityInfo> = {
  wholesome: {
    style: 'wholesome',
    name: 'Wholesome',
    tagline: 'Sweet, encouraging, a little silly',
    sample: "You're doing better than your Wi-Fi thinks. ✨",
  },
  chaotic: {
    style: 'chaotic',
    name: 'Chaotic',
    tagline: 'Absurd, loud, completely unexpected',
    sample: 'BREAKING NEWS: Your laundry has declared independence. 🧦',
  },
  sarcastic: {
    style: 'sarcastic',
    name: 'Sarcastic',
    tagline: 'Dry wit and playful teasing',
    sample: 'A 30-minute nap lasting three hours? Impressive time management.',
  },
  chill: {
    style: 'chill',
    name: 'Chill',
    tagline: 'Relaxed humor, gentle conversation',
    sample: 'Sounds like a blanket-and-snack kind of evening.',
  },
};
