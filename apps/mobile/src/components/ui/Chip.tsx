import { MIN_TOUCH_TARGET } from '@bot-friend/shared';
import { useTheme } from '@/theme/theme';
import { Tactile } from './Pressable';
import { Text } from './Text';

export function Chip({
  label,
  onPress,
  selected,
  tone = 'default',
  accessibilityHint,
  testID,
}: {
  label: string;
  onPress?: () => void;
  selected?: boolean;
  tone?: 'default' | 'warm' | 'calm';
  accessibilityHint?: string;
  testID?: string;
}) {
  const t = useTheme();
  const base =
    tone === 'warm'
      ? { bg: t.colors.accentWarmSoft, border: t.colors.accentWarmSoft }
      : tone === 'calm'
        ? { bg: t.dark ? t.colors.surfaceRaised : t.colors.accentCalm, border: 'transparent' }
        : { bg: t.colors.surface, border: t.colors.border };
  return (
    <Tactile
      testID={testID}
      onPress={onPress}
      haptic="select"
      accessibilityRole={selected === undefined ? 'button' : 'checkbox'}
      accessibilityState={selected === undefined ? undefined : { checked: selected }}
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      style={{
        minHeight: MIN_TOUCH_TARGET - 4,
        paddingHorizontal: t.space[4],
        justifyContent: 'center',
        borderRadius: t.radius.chip,
        backgroundColor: selected ? t.colors.primary : base.bg,
        borderWidth: 1.5,
        borderColor: selected ? t.colors.primary : base.border,
      }}
    >
      <Text
        variant="callout"
        weight="medium"
        style={{ color: selected ? t.colors.textOnPrimary : t.colors.text }}
      >
        {label}
      </Text>
    </Tactile>
  );
}
