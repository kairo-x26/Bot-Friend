import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import type { VoiceState } from '@/lib/voice/transport';
import { useTheme } from '@/theme/theme';

const BARS = [0.45, 0.8, 1, 0.7, 0.5, 0.85, 0.6];

function Bar({ index, state }: { index: number; state: VoiceState }) {
  const t = useTheme();
  const level = useSharedValue(0.2);
  const active = state === 'botSpeaking' || state === 'userSpeaking';

  useEffect(() => {
    if (t.reducedMotion || !active) {
      cancelAnimation(level);
      level.value = withTiming(state === 'listening' ? 0.3 : 0.15, { duration: 200 });
      return;
    }
    const peak = BARS[index]!;
    level.value = withDelay(
      index * 70,
      withRepeat(
        withTiming(peak, { duration: 260 + index * 30, easing: Easing.inOut(Easing.quad) }),
        -1,
        true,
      ),
    );
  }, [active, state, index, level, t.reducedMotion]);

  const style = useAnimatedStyle(() => ({ height: `${Math.round(level.value * 100)}%` }));
  const color =
    state === 'botSpeaking'
      ? t.colors.primary
      : state === 'userSpeaking'
        ? t.colors.accentWarm
        : t.colors.border;
  return <Animated.View style={[{ width: 14, borderRadius: 7, backgroundColor: color }, style]} />;
}

export function Waveform({ state }: { state: VoiceState }) {
  return (
    <View
      accessible
      accessibilityLabel={
        state === 'botSpeaking'
          ? 'Bot-Friend is talking'
          : state === 'userSpeaking'
            ? 'Listening to you'
            : 'Waiting'
      }
      style={{
        height: 120,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
      }}
    >
      {BARS.map((_, i) => (
        <Bar key={i} index={i} state={state} />
      ))}
    </View>
  );
}
