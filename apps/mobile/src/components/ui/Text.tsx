import type { TypeVariant } from '@bot-friend/shared';
import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';
import { useTheme } from '@/theme/theme';

export interface TextProps extends RNTextProps {
  variant?: TypeVariant;
  weight?: 'regular' | 'medium' | 'semibold' | 'bold';
  /** Use the display face (Bricolage Grotesque). Defaults on for hero/title/heading. */
  display?: boolean;
  tone?: 'default' | 'muted' | 'primary' | 'danger' | 'onPrimary' | 'calm';
  align?: TextStyle['textAlign'];
}

const DISPLAY_VARIANTS: TypeVariant[] = ['hero', 'title', 'heading'];

export function Text({
  variant = 'body',
  weight,
  display,
  tone = 'default',
  align,
  style,
  ...rest
}: TextProps) {
  const t = useTheme();
  const scale = t.type[variant];
  const useDisplay = display ?? DISPLAY_VARIANTS.includes(variant);
  const family = useDisplay
    ? variant === 'hero'
      ? t.font.displayHeavy
      : weight === 'medium' || weight === 'semibold'
        ? t.font.displayMedium
        : t.font.display
    : {
        regular: t.font.body,
        medium: t.font.bodyMedium,
        semibold: t.font.bodySemibold,
        bold: t.font.bodyBold,
      }[weight ?? 'regular'];
  const color = {
    default: t.colors.text,
    muted: t.colors.textMuted,
    primary: t.colors.primaryText,
    danger: t.colors.danger,
    onPrimary: t.colors.textOnPrimary,
    calm: t.colors.accentCalmText,
  }[tone];

  return (
    <RNText
      maxFontSizeMultiplier={1.6}
      {...rest}
      style={[
        {
          fontFamily: family,
          fontSize: scale.fontSize * t.textScale,
          lineHeight: scale.lineHeight * t.textScale,
          letterSpacing: scale.letterSpacing,
          color,
          textAlign: align,
        },
        style,
      ]}
    />
  );
}
