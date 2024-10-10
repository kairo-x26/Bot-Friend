/**
 * Bot-Friend design tokens — "Playful Cosmic Minimalism".
 * Brand hexes come from the PRD; the rest are derived to hit WCAG AA on text.
 */

export const brand = {
  electricViolet: '#6C5CE7',
  softLavender: '#C8B6FF',
  peach: '#FFB4A2',
  mint: '#CBF7DE',
  midnight: '#171526',
} as const;

export interface ColorScheme {
  background: string;
  backgroundAlt: string;
  surface: string;
  surfaceRaised: string;
  border: string;
  text: string;
  textMuted: string;
  textOnPrimary: string;
  primary: string;
  primaryPressed: string;
  /** Primary hue tuned for text/icons on background (links, active tab). */
  primaryText: string;
  primarySoft: string;
  accentWarm: string;
  accentWarmSoft: string;
  accentCalm: string;
  accentCalmText: string;
  userBubble: string;
  userBubbleText: string;
  botBubble: string;
  botBubbleText: string;
  danger: string;
  dangerSoft: string;
  focusRing: string;
  scrim: string;
  starfield: string;
}

export const lightColors: ColorScheme = {
  background: '#F6F3FF',
  backgroundAlt: '#EEE8FF',
  surface: '#FFFFFF',
  surfaceRaised: '#FFFFFF',
  border: '#E1D9FA',
  text: '#1D1933',
  textMuted: '#5E587A',
  textOnPrimary: '#FFFFFF',
  primary: brand.electricViolet,
  primaryPressed: '#5546D1',
  primaryText: '#5546D1',
  primarySoft: '#E6E0FF',
  accentWarm: brand.peach,
  accentWarmSoft: '#FFE5DD',
  accentCalm: brand.mint,
  accentCalmText: '#1F6B47',
  userBubble: brand.electricViolet,
  userBubbleText: '#FFFFFF',
  botBubble: '#FFFFFF',
  botBubbleText: '#1D1933',
  danger: '#C0392B',
  dangerSoft: '#FDE4E1',
  focusRing: '#4A3CC9',
  scrim: 'rgba(23, 21, 38, 0.45)',
  starfield: '#C8B6FF',
};

/** Designed dark palette — night sky, not inverted light. */
export const darkColors: ColorScheme = {
  background: brand.midnight,
  backgroundAlt: '#1D1A30',
  surface: '#221F37',
  surfaceRaised: '#2B2745',
  border: '#3A3558',
  text: '#F3F0FF',
  textMuted: '#ABA4CC',
  textOnPrimary: '#FFFFFF',
  primary: '#6C5CE7',
  primaryPressed: '#5A4AD6',
  primaryText: '#ADA2FF',
  primarySoft: '#2F2A55',
  accentWarm: '#FFB4A2',
  accentWarmSoft: '#3D2A33',
  accentCalm: '#9FE8C0',
  accentCalmText: '#9FE8C0',
  userBubble: '#6C5CE7',
  userBubbleText: '#FFFFFF',
  botBubble: '#2B2745',
  botBubbleText: '#F3F0FF',
  danger: '#FF8A7A',
  dangerSoft: '#40242A',
  focusRing: '#C8B6FF',
  scrim: 'rgba(5, 4, 12, 0.6)',
  starfield: '#6E64A8',
};

export const mascotPalettes = {
  violet: { body: '#7B6CF0', shade: '#5F50D8', cheek: '#FFB4A2' },
  peach: { body: '#FFB4A2', shade: '#F2937D', cheek: '#FF8E8E' },
  mint: { body: '#A8EDC7', shade: '#7DD6A6', cheek: '#FFB4A2' },
  lavender: { body: '#C8B6FF', shade: '#A894F2', cheek: '#FFB4A2' },
} as const;

/** 4pt spacing grid. */
export const space = { 0: 0, 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40, 12: 48, 16: 64 } as const;

/** Radii by role, not one value for everything. */
export const radius = {
  chip: 999,
  bubble: 22,
  bubbleTail: 6,
  card: 20,
  sheet: 28,
  input: 24,
  button: 16,
} as const;

export const fontFamily = {
  display: 'BricolageGrotesque_700Bold',
  displayHeavy: 'BricolageGrotesque_800ExtraBold',
  displayMedium: 'BricolageGrotesque_600SemiBold',
  body: 'Figtree_400Regular',
  bodyMedium: 'Figtree_500Medium',
  bodySemibold: 'Figtree_600SemiBold',
  bodyBold: 'Figtree_700Bold',
} as const;

/** Modular scale (~1.2) anchored at 16. lineHeight in px. */
export const typeScale = {
  hero: { fontSize: 40, lineHeight: 44, letterSpacing: -1 },
  title: { fontSize: 28, lineHeight: 32, letterSpacing: -0.5 },
  heading: { fontSize: 22, lineHeight: 28, letterSpacing: -0.2 },
  subheading: { fontSize: 18, lineHeight: 24, letterSpacing: 0 },
  body: { fontSize: 16, lineHeight: 23, letterSpacing: 0 },
  callout: { fontSize: 15, lineHeight: 21, letterSpacing: 0 },
  caption: { fontSize: 13, lineHeight: 18, letterSpacing: 0.1 },
  micro: { fontSize: 11, lineHeight: 14, letterSpacing: 0.2 },
} as const;
export type TypeVariant = keyof typeof typeScale;

export const motion = {
  /** Durations in ms. */
  instant: 90,
  quick: 160,
  base: 240,
  slow: 420,
  spring: { damping: 14, stiffness: 180, mass: 0.9 },
  bouncy: { damping: 9, stiffness: 200, mass: 0.8 },
} as const;

export const MIN_TOUCH_TARGET = 44;
