import { describe, expect, it } from 'vitest';
import { darkColors, lightColors, type ColorScheme } from '../src/index.js';

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r!) + 0.7152 * lin(g!) + 0.0722 * lin(b!);
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

const pairs: Array<[keyof ColorScheme, keyof ColorScheme, number]> = [
  ['text', 'background', 4.5],
  ['text', 'surface', 4.5],
  ['textMuted', 'background', 4.5],
  ['textMuted', 'surface', 4.5],
  ['userBubbleText', 'userBubble', 4.5],
  ['botBubbleText', 'botBubble', 4.5],
  ['textOnPrimary', 'primary', 4.5],
  ['textOnPrimary', 'primaryPressed', 4.5],
  ['primaryText', 'background', 4.5],
  ['primaryText', 'surface', 4.5],
  ['focusRing', 'background', 3],
  ['danger', 'surface', 4.5],
  ['accentCalmText', 'surface', 4.5],
];

describe.each([
  ['light', lightColors],
  ['dark', darkColors],
])('%s palette contrast', (_name, scheme) => {
  it.each(pairs)('%s on %s ≥ %d:1', (fg, bg, min) => {
    expect(contrast(scheme[fg], scheme[bg])).toBeGreaterThanOrEqual(min);
  });
});
