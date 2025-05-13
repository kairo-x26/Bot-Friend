import { MIN_TOUCH_TARGET } from '@bot-friend/shared';
import { ActivityIndicator, View } from 'react-native';
import { useTheme } from '@/theme/theme';
import { Icon, type IconName } from './Icon';
import { Tactile } from './Pressable';
import { Text } from './Text';

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  size?: 'md' | 'lg';
  accessibilityHint?: string;
  testID?: string;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  loading,
  disabled,
  size = 'md',
  accessibilityHint,
  testID,
}: ButtonProps) {
  const t = useTheme();
  const palette = {
    primary: { bg: t.colors.primary, fg: t.colors.textOnPrimary, border: t.colors.primary },
    secondary: { bg: t.colors.surface, fg: t.colors.text, border: t.colors.border },
    ghost: { bg: 'transparent', fg: t.colors.primaryText, border: 'transparent' },
    danger: { bg: t.colors.dangerSoft, fg: t.colors.danger, border: t.colors.dangerSoft },
  }[variant];
  const inactive = disabled || loading;

  return (
    <Tactile
      testID={testID}
      onPress={inactive ? undefined : onPress}
      disabled={inactive}
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      haptic={variant === 'primary' ? 'medium' : 'light'}
      style={{
        minHeight: size === 'lg' ? 56 : MIN_TOUCH_TARGET + 4,
        paddingHorizontal: size === 'lg' ? t.space[6] : t.space[5],
        borderRadius: t.radius.button,
        backgroundColor: palette.bg,
        borderWidth: variant === 'secondary' ? 1.5 : 0,
        borderColor: palette.border,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.45 : 1,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[2] }}>
        {loading ? (
          <ActivityIndicator color={palette.fg} />
        ) : (
          icon && <Icon name={icon} size={20} color={palette.fg} />
        )}
        <Text
          variant={size === 'lg' ? 'subheading' : 'callout'}
          weight="semibold"
          style={{ color: palette.fg }}
        >
          {label}
        </Text>
      </View>
    </Tactile>
  );
}

export function IconButton({
  icon,
  label,
  onPress,
  tone = 'plain',
  size = 44,
  disabled,
  testID,
}: {
  icon: IconName;
  label: string;
  onPress?: () => void;
  tone?: 'plain' | 'primary' | 'soft';
  size?: number;
  disabled?: boolean;
  testID?: string;
}) {
  const t = useTheme();
  const bg =
    tone === 'primary' ? t.colors.primary : tone === 'soft' ? t.colors.primarySoft : 'transparent';
  const fg =
    tone === 'primary'
      ? t.colors.textOnPrimary
      : tone === 'soft'
        ? t.colors.primaryText
        : t.colors.text;
  return (
    <Tactile
      testID={testID}
      accessibilityLabel={label}
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      accessibilityState={{ disabled: !!disabled }}
      hitSlop={size < MIN_TOUCH_TARGET ? (MIN_TOUCH_TARGET - size) / 2 : 0}
      squish={0.9}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: bg,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <Icon name={icon} size={Math.round(size * 0.5)} color={fg} />
    </Tactile>
  );
}
