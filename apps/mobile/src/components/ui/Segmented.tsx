import { View } from 'react-native';
import { useTheme } from '@/theme/theme';
import { Tactile } from './Pressable';
import { Text } from './Text';

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  const t = useTheme();
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      style={{
        flexDirection: 'row',
        backgroundColor: t.colors.backgroundAlt,
        borderRadius: t.radius.button,
        padding: 4,
        gap: 4,
      }}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Tactile
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            accessibilityLabel={o.label}
            onPress={() => onChange(o.value)}
            haptic="select"
            style={{
              flex: 1,
              minHeight: 40,
              borderRadius: t.radius.button - 4,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: active ? t.colors.surface : 'transparent',
              borderWidth: active ? 1 : 0,
              borderColor: t.colors.border,
            }}
          >
            <Text variant="callout" weight={active ? 'semibold' : 'medium'} tone={active ? 'default' : 'muted'}>
              {o.label}
            </Text>
          </Tactile>
        );
      })}
    </View>
  );
}
