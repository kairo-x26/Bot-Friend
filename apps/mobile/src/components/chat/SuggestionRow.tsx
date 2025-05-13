import { ScrollView } from 'react-native';
import { Chip } from '@/components/ui';
import { useTheme } from '@/theme/theme';

export function SuggestionRow({
  suggestions,
  onPick,
}: {
  suggestions: string[];
  onPick: (text: string) => void;
}) {
  const t = useTheme();
  if (suggestions.length === 0) return null;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityLabel="Suggested replies"
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{
        gap: t.space[2],
        paddingHorizontal: t.space[4],
        paddingBottom: t.space[2],
      }}
    >
      {suggestions.map((s) => (
        <Chip
          key={s}
          label={s}
          onPress={() => onPick(s)}
          accessibilityHint="Sends this as your message"
        />
      ))}
    </ScrollView>
  );
}
