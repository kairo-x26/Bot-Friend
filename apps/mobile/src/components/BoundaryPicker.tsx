import { humorBoundaryTopics, type HumorBoundary } from '@bot-friend/shared';
import { View } from 'react-native';
import { Chip } from '@/components/ui';
import { useTheme } from '@/theme/theme';

export const BOUNDARY_LABELS: Record<HumorBoundary, string> = {
  appearance: 'Looks',
  family: 'Family',
  relationships: 'Dating',
  work: 'Work',
  money: 'Money',
  health: 'Health',
  food: 'Food',
  pets: 'Pets',
};

/** Multi-select of topics Bot-Friend should never joke about. */
export function BoundaryPicker({ value, onChange }: { value: HumorBoundary[]; onChange: (next: HumorBoundary[]) => void }) {
  const t = useTheme();
  return (
    <View accessibilityLabel="Off-limits topics" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space[2] }}>
      {humorBoundaryTopics.map((b) => {
        const on = value.includes(b);
        return (
          <Chip
            key={b}
            label={BOUNDARY_LABELS[b]}
            selected={on}
            testID={`boundary-${b}`}
            onPress={() => onChange(on ? value.filter((x) => x !== b) : [...value, b])}
          />
        );
      })}
    </View>
  );
}
