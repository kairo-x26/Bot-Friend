import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from '@/theme/theme';
import { Tactile } from './Pressable';
import { Text } from './Text';

/** Labelled switch row. The whole row is the touch target. */
export function Toggle({
  label,
  description,
  value,
  onChange,
  testID,
}: {
  label: string;
  description?: string;
  value: boolean;
  onChange: (next: boolean) => void;
  testID?: string;
}) {
  const t = useTheme();
  const progress = useSharedValue(value ? 1 : 0);
  useEffect(() => {
    progress.value = t.reducedMotion
      ? withTiming(value ? 1 : 0, { duration: 0 })
      : withSpring(value ? 1 : 0, t.motion.spring);
  }, [value, t.reducedMotion, progress, t.motion.spring]);

  const track = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.value, [0, 1], [t.colors.border, t.colors.primary]),
  }));
  const knob = useAnimatedStyle(() => ({ transform: [{ translateX: progress.value * 20 }] }));

  return (
    <Tactile
      testID={testID}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={label}
      accessibilityHint={description}
      onPress={() => onChange(!value)}
      haptic="select"
      squish={0.99}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: t.space[3],
        gap: t.space[4],
      }}
    >
      <View style={{ flex: 1 }}>
        <Text weight="medium">{label}</Text>
        {description ? (
          <Text variant="caption" tone="muted" style={{ marginTop: 2 }}>
            {description}
          </Text>
        ) : null}
      </View>
      <Animated.View style={[{ width: 48, height: 28, borderRadius: 14, padding: 3 }, track]}>
        <Animated.View
          style={[
            {
              width: 22,
              height: 22,
              borderRadius: 11,
              backgroundColor: '#FFFFFF',
              shadowColor: '#000',
              shadowOpacity: 0.15,
              shadowRadius: 2,
              shadowOffset: { width: 0, height: 1 },
            },
            knob,
          ]}
        />
      </Animated.View>
    </Tactile>
  );
}
