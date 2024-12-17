import * as Haptics from 'expo-haptics';
import type { ReactNode } from 'react';
import { Platform, Pressable as RNPressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { usePrefs } from '@/lib/prefs';
import { useTheme } from '@/theme/theme';

const AnimatedPressable = Animated.createAnimatedComponent(RNPressable);

export interface TactileProps extends Omit<PressableProps, 'style' | 'children'> {
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
  /** How far the control squishes when pressed. */
  squish?: number;
  haptic?: 'light' | 'medium' | 'select' | false;
}

/** Pressable with a springy squish and optional haptic tick. Honors reduced motion. */
export function Tactile({ style, children, squish = 0.96, haptic = 'light', onPressIn, onPressOut, onPress, ...rest }: TactileProps) {
  const t = useTheme();
  const hapticsEnabled = usePrefs((s) => s.prefs.hapticsEnabled);
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <AnimatedPressable
      accessibilityRole="button"
      {...rest}
      onPressIn={(e) => {
        if (!t.reducedMotion) scale.value = withSpring(squish, t.motion.spring);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        scale.value = withSpring(1, t.motion.bouncy);
        onPressOut?.(e);
      }}
      onPress={(e) => {
        if (haptic && hapticsEnabled && Platform.OS !== 'web') {
          if (haptic === 'select') void Haptics.selectionAsync();
          else void Haptics.impactAsync(haptic === 'medium' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light);
        }
        onPress?.(e);
      }}
      style={[style, animated]}
    >
      {children}
    </AnimatedPressable>
  );
}
