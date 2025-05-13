import type { ReactNode } from 'react';
import { ScrollView, View, type ScrollViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/theme';
import { Text } from './Text';

export function Screen({
  title,
  subtitle,
  children,
  scroll = true,
  headerRight,
  ...rest
}: {
  title?: string;
  subtitle?: string;
  children: ReactNode;
  scroll?: boolean;
  headerRight?: ReactNode;
} & ScrollViewProps) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const header = title ? (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', marginBottom: t.space[5] }}>
      <View style={{ flex: 1 }}>
        <Text variant="title" accessibilityRole="header">
          {title}
        </Text>
        {subtitle ? (
          <Text tone="muted" style={{ marginTop: t.space[1] }}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {headerRight}
    </View>
  ) : null;
  const padding = {
    paddingTop: insets.top + t.space[4],
    paddingHorizontal: t.space[5],
    paddingBottom: t.space[10],
  };
  if (!scroll) {
    return (
      <View style={[{ flex: 1, backgroundColor: t.colors.background }, padding]}>
        {header}
        {children}
      </View>
    );
  }
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: t.colors.background }}
      contentContainerStyle={[padding, { gap: t.space[6] }]}
      keyboardShouldPersistTaps="handled"
      {...rest}
    >
      {header}
      {children}
    </ScrollView>
  );
}
