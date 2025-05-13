import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from '@/theme/theme';

function Dot({ delay }: { delay: number }) {
  const t = useTheme();
  const y = useSharedValue(0);
  useEffect(() => {
    if (t.reducedMotion) return;
    y.value = withDelay(
      delay,
      withRepeat(
        withSequence(withTiming(-4, { duration: 260 }), withTiming(0, { duration: 260 })),
        -1,
      ),
    );
  }, [delay, t.reducedMotion, y]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  return (
    <Animated.View
      style={[{ width: 7, height: 7, borderRadius: 4, backgroundColor: t.colors.textMuted }, style]}
    />
  );
}

/** Shown in a reply bubble until the first words arrive. */
export function ThinkingDots() {
  return (
    <View
      accessible
      accessibilityLabel="Bot-Friend is typing"
      style={{ flexDirection: 'row', gap: 5, paddingVertical: 6 }}
    >
      <Dot delay={0} />
      <Dot delay={140} />
      <Dot delay={280} />
    </View>
  );
}
