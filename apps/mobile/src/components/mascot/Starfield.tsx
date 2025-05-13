import { memo } from 'react';
import { StyleSheet } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { useTheme } from '@/theme/theme';

/** Sparse, fixed starfield behind hero areas. Purely decorative. */
export const Starfield = memo(function Starfield({ height = 260 }: { height?: number }) {
  const t = useTheme();
  const stars = [
    [8, 18, 1.4],
    [22, 62, 1],
    [35, 12, 1.8],
    [48, 40, 1],
    [61, 22, 1.2],
    [74, 58, 1.6],
    [86, 14, 1],
    [93, 44, 1.3],
    [15, 86, 1.1],
    [80, 88, 1],
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
        d="M70 30 l.8 1.8 1.8.8-1.8.8-.8 1.8-.8-1.8-1.8-.8 1.8-.8Z"
        fill={t.colors.accentWarm}
      />
      <Path d="M20 35 l.6 1.3 1.3.6-1.3.6-.6 1.3-.6-1.3-1.3-.6 1.3-.6Z" fill={t.colors.starfield} />
    </Svg>
  );
});
