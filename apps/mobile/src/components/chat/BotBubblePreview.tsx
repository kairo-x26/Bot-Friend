import { View } from 'react-native';
import { Text } from '@/components/ui';
import { useTheme } from '@/theme/theme';

/** A static reply bubble used to preview a personality. */
export function BotBubblePreview({ text }: { text: string }) {
  const t = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={`Example reply: ${text}`}
      style={{
        alignSelf: 'flex-start',
        maxWidth: '88%',
        backgroundColor: t.colors.botBubble,
        borderRadius: t.radius.bubble,
        borderBottomLeftRadius: t.radius.bubbleTail,
        paddingHorizontal: t.space[4],
        paddingVertical: t.space[3],
        borderWidth: 1,
        borderColor: t.colors.border,
      }}
    >
      <Text style={{ color: t.colors.botBubbleText }}>{text}</Text>
    </View>
  );
}
