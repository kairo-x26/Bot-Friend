import { mascotPalettes, type MascotColor } from '@bot-friend/shared';
import { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Ellipse, G, Path } from 'react-native-svg';
import type { MascotMood } from '@/lib/chat/reducer';
import { useTheme } from '@/theme/theme';

const INK = '#1D1933';

const MOOD_LABEL: Record<MascotMood, string> = {
  idle: 'relaxed',
  happy: 'happy',
  laughing: 'laughing',
  thinking: 'thinking',
  surprised: 'surprised',
  caring: 'listening closely',
  sleepy: 'sleepy',
};

export interface MascotProps {
  mood?: MascotMood;
  size?: number;
  color?: MascotColor;
  /** Tapping makes Bot-Friend giggle. */
  interactive?: boolean;
  testID?: string;
}

/**
 * Bot-Friend: a soft cosmic blob with an antenna. Breathes, blinks and reacts to
 * the conversation. All looping motion stops when reduced motion is on.
 */
export function Mascot({ mood = 'idle', size = 120, color = 'violet', interactive = false, testID }: MascotProps) {
  const t = useTheme();
  const palette = mascotPalettes[color];
  const [tapMood, setTapMood] = useState<MascotMood | null>(null);
  const shown = tapMood ?? mood;

  const breath = useSharedValue(0);
  const blink = useSharedValue(1);
  const bounce = useSharedValue(0);
  const antenna = useSharedValue(0);

  useEffect(() => {
    if (t.reducedMotion) {
      cancelAnimation(breath);
      cancelAnimation(antenna);
      breath.value = 0;
      antenna.value = 0;
      return;
    }
    const speed = shown === 'thinking' ? 700 : shown === 'sleepy' ? 2200 : 1600;
    breath.value = withRepeat(withTiming(1, { duration: speed, easing: Easing.inOut(Easing.sin) }), -1, true);
    antenna.value = withRepeat(
      withSequence(withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }), withTiming(-1, { duration: 900, easing: Easing.inOut(Easing.quad) })),
      -1,
      true,
    );
  }, [t.reducedMotion, shown, breath, antenna]);

  // Blinks at irregular intervals, like a real face.
  const blinkTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (t.reducedMotion || shown === 'sleepy' || shown === 'laughing') return;
    const schedule = () => {
      blinkTimer.current = setTimeout(() => {
        blink.value = withSequence(withTiming(0.1, { duration: 70 }), withTiming(1, { duration: 110 }));
        schedule();
      }, 2200 + Math.random() * 2800);
    };
    schedule();
    return () => {
      if (blinkTimer.current) clearTimeout(blinkTimer.current);
    };
  }, [t.reducedMotion, shown, blink]);

  // A little hop whenever the mood changes, so reactions read at a glance.
  useEffect(() => {
    if (t.reducedMotion) return;
    bounce.value = withSequence(withTiming(-0.08, { duration: 120 }), withSpring(0, t.motion.bouncy));
  }, [shown, t.reducedMotion, bounce, t.motion.bouncy]);

  const bodyStyle = useAnimatedStyle(() => {
    const squash = breath.value * 0.035;
    return {
      transform: [
        { translateY: bounce.value * size + breath.value * size * 0.015 },
        { scaleX: 1 + squash },
        { scaleY: 1 - squash },
        { rotate: shown === 'caring' ? '-5deg' : '0deg' },
      ],
    };
  });
  const eyeStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: shown === 'thinking' ? size * 0.03 : 0 },
      { translateY: shown === 'thinking' ? -size * 0.035 : 0 },
      { scaleY: blink.value },
    ],
  }));
  const antennaStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${antenna.value * 8}deg` }] }));

  const onPress = () => {
    if (!interactive) return;
    setTapMood('laughing');
    if (!t.reducedMotion) {
      bounce.value = withSequence(withTiming(-0.14, { duration: 140 }), withSpring(0, t.motion.bouncy));
    }
    setTimeout(() => setTapMood(null), 1400);
  };

  const face = (
    <Animated.View style={[{ width: size, height: size }, bodyStyle]}>
      {/* antenna pivots at its base */}
      <Animated.View
        style={[
          { position: 'absolute', left: size * 0.47, top: -size * 0.02, width: size * 0.2, height: size * 0.2, transformOrigin: 'bottom left' },
          antennaStyle,
        ]}
      >
        <Svg width="100%" height="100%" viewBox="0 0 20 20">
          <Path d="M3 19 C4 12 7 8 11 5" stroke={palette.shade} strokeWidth={2.4} strokeLinecap="round" fill="none" />
          <Path
            d="M12.5 1.2 l1.1 2.4 2.6.3-1.9 1.8.5 2.6-2.3-1.3-2.3 1.3.5-2.6-1.9-1.8 2.6-.3Z"
            fill={t.colors.accentWarm}
          />
        </Svg>
      </Animated.View>

      <Svg width={size} height={size} viewBox="0 0 100 100" style={{ position: 'absolute' }}>
        <Ellipse cx="37" cy="91" rx="8" ry="4" fill={palette.shade} />
        <Ellipse cx="63" cy="91" rx="8" ry="4" fill={palette.shade} />
        <Path d="M52 16 C76 17 91 34 90 57 C89 78 73 91 50 90 C27 89 10 77 10 55 C10 33 28 15 52 16 Z" fill={palette.body} />
        <Path d="M22 70 C30 84 46 89 62 86 C74 83 84 75 88 64 C86 80 72 91 50 90 C32 89 19 81 14 68 Z" fill={palette.shade} opacity={0.55} />
        <Ellipse cx="33" cy="32" rx="9" ry="5" fill="#FFFFFF" opacity={0.28} transform="rotate(-28 33 32)" />
        <Ellipse cx="27" cy="63" rx="6.5" ry="4" fill={palette.cheek} opacity={shown === 'caring' ? 0.9 : 0.6} />
        <Ellipse cx="73" cy="63" rx="6.5" ry="4" fill={palette.cheek} opacity={shown === 'caring' ? 0.9 : 0.6} />
        <Mouth mood={shown} />
      </Svg>

      <Animated.View style={[{ position: 'absolute', width: size, height: size }, eyeStyle]}>
        <Svg width={size} height={size} viewBox="0 0 100 100">
          <Eyes mood={shown} />
        </Svg>
      </Animated.View>
    </Animated.View>
  );

  const label = `Bot-Friend, looking ${MOOD_LABEL[shown]}`;
  if (!interactive) {
    return (
      <View testID={testID} accessible accessibilityRole="image" accessibilityLabel={label}>
        {face}
      </View>
    );
  }
  return (
    <Pressable testID={testID} onPress={onPress} accessibilityRole="button" accessibilityLabel={label} accessibilityHint="Tap to make Bot-Friend giggle">
      {face}
    </Pressable>
  );
}

function Eyes({ mood }: { mood: MascotMood }) {
  if (mood === 'laughing') {
    return (
      <G stroke={INK} strokeWidth={3.2} strokeLinecap="round" fill="none">
        <Path d="M32 52 Q37 45 42 52" />
        <Path d="M58 52 Q63 45 68 52" />
      </G>
    );
  }
  if (mood === 'sleepy') {
    return (
      <G stroke={INK} strokeWidth={3} strokeLinecap="round" fill="none">
        <Path d="M32 51 Q37 55 42 51" />
        <Path d="M58 51 Q63 55 68 51" />
      </G>
    );
  }
  const ry = mood === 'surprised' ? 8.5 : mood === 'caring' ? 5.6 : 7.4;
  const rx = mood === 'surprised' ? 6.4 : 5.6;
  return (
    <G>
      <Ellipse cx="37" cy="50" rx={rx} ry={ry} fill={INK} />
      <Ellipse cx="63" cy="50" rx={rx} ry={ry} fill={INK} />
      <Circle cx="39" cy="46.5" r="1.9" fill="#FFFFFF" />
      <Circle cx="65" cy="46.5" r="1.9" fill="#FFFFFF" />
      {mood === 'surprised' && (
        <G stroke={INK} strokeWidth={2.4} strokeLinecap="round" fill="none">
          <Path d="M31 37 Q36 33 42 36" />
          <Path d="M58 36 Q64 33 69 37" />
        </G>
      )}
    </G>
  );
}

function Mouth({ mood }: { mood: MascotMood }) {
  switch (mood) {
    case 'laughing':
      return (
        <G>
          <Path d="M39 62 Q50 79 61 62 Z" fill={INK} />
          <Path d="M44 70 Q50 75 56 70 Q50 67 44 70 Z" fill="#FF8E8E" />
        </G>
      );
    case 'happy':
      return <Path d="M41 63 Q50 73 59 63" stroke={INK} strokeWidth={3.2} strokeLinecap="round" fill="none" />;
    case 'thinking':
      return <Circle cx="55" cy="67" r="2.6" fill={INK} />;
    case 'surprised':
      return <Ellipse cx="50" cy="68" rx="4.2" ry="5.2" fill={INK} />;
    case 'caring':
      return <Path d="M44.5 65 Q50 69 55.5 65" stroke={INK} strokeWidth={3} strokeLinecap="round" fill="none" />;
    case 'sleepy':
      return <Path d="M46 67 Q50 68.5 54 67" stroke={INK} strokeWidth={2.6} strokeLinecap="round" fill="none" />;
    default:
      return <Path d="M44 64 Q50 70 56 64" stroke={INK} strokeWidth={3} strokeLinecap="round" fill="none" />;
  }
}
