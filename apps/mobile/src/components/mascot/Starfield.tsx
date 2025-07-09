import { memo } from 'react';
import { StyleSheet } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { useTheme } from '@/theme/theme';

/** Sparse, fixed starfield behind hero areas. Purely decorative. */
export const Starfield = memo(function Starfield({ height = 260 }: { height?: number }) {
  const t = useTheme();
  // Stars hug the edges so they never sit behind headlines or controls.
  const stars = [
    [4, 14, 1.4],
    [9, 62, 1],
    [3, 88, 1.1],
    [93, 10, 1.8],
    [97, 46, 1.2],
    [91, 82, 1],
    [50, 4, 1],
    [70, 3, 1.3],
  ] as const;
  return (
    <Svg
      width="100%"
      height={height}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      style={[StyleSheet.absoluteFill, { opacity: t.dark ? 0.9 : 0.55 }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {stars.map(([x, y, r], i) => (
        <Circle key={i} cx={x} cy={y} r={r * 0.5} fill={t.colors.starfield} />
      ))}
      <Path
        d="M86 20 l.8 1.8 1.8.8-1.8.8-.8 1.8-.8-1.8-1.8-.8 1.8-.8Z"
        fill={t.colors.accentWarm}
      />
      <Path d="M6 32 l.6 1.3 1.3.6-1.3.6-.6 1.3-.6-1.3-1.3-.6 1.3-.6Z" fill={t.colors.starfield} />
    </Svg>
  );
});
