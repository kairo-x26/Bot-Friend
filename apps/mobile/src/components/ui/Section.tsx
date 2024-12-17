import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useTheme } from '@/theme/theme';
import { Text } from './Text';

/** Grouped content with a plain heading; no card chrome unless asked for. */
export function Section({ title, children, framed = true }: { title?: string; children: ReactNode; framed?: boolean }) {
  const t = useTheme();
  return (
    <View style={{ gap: t.space[2] }}>
      {title ? (
        <Text variant="subheading" display weight="semibold" accessibilityRole="header">
          {title}
        </Text>
      ) : null}
      <View
        style={
          framed
            ? {
                backgroundColor: t.colors.surface,
                borderRadius: t.radius.card,
                paddingHorizontal: t.space[4],
                paddingVertical: t.space[1],
                borderWidth: t.dark ? 1 : 0,
                borderColor: t.colors.border,
              }
            : undefined
        }
      >
        {children}
      </View>
    </View>
  );
}

export function Divider() {
  const t = useTheme();
  return <View style={{ height: 1, backgroundColor: t.colors.border, opacity: 0.7 }} />;
}
