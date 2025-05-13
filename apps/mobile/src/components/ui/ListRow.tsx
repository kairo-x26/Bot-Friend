import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useTheme } from '@/theme/theme';
import { Icon, type IconName } from './Icon';
import { Tactile } from './Pressable';
import { Text } from './Text';

export function ListRow({
  icon,
  label,
  detail,
  onPress,
  tone = 'default',
  trailing,
  testID,
}: {
  icon?: IconName;
  label: string;
  detail?: string;
  onPress?: () => void;
  tone?: 'default' | 'danger';
  trailing?: ReactNode;
  testID?: string;
}) {
  const t = useTheme();
  const color = tone === 'danger' ? t.colors.danger : t.colors.text;
  const content = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: t.space[3],
        minHeight: 52,
        paddingVertical: t.space[2],
      }}
    >
      {icon ? <Icon name={icon} size={22} color={color} /> : null}
      <View style={{ flex: 1 }}>
        <Text weight="medium" style={{ color }}>
          {label}
        </Text>
        {detail ? (
          <Text variant="caption" tone="muted">
            {detail}
          </Text>
        ) : null}
      </View>
      {trailing}
    </View>
  );
  if (!onPress) return content;
  return (
    <Tactile
      testID={testID}
      onPress={onPress}
      accessibilityLabel={detail ? `${label}, ${detail}` : label}
      squish={0.99}
    >
      {content}
    </Tactile>
  );
}
