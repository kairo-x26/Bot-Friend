import { PERSONALITIES, comedyStyles, type ComedyStyle } from '@bot-friend/shared';
import { View } from 'react-native';
import { ListRow, Sheet } from '@/components/ui';
import { useTheme } from '@/theme/theme';

export function StylePicker({
  visible,
  value,
  onPick,
  onClose,
}: {
  visible: boolean;
  value: ComedyStyle;
  onPick: (s: ComedyStyle) => void;
  onClose: () => void;
}) {
  const t = useTheme();
  return (
    <Sheet visible={visible} onClose={onClose} title="Switch my vibe">
      <View accessibilityRole="radiogroup">
        {comedyStyles.map((s) => (
          <ListRow
            key={s}
            label={PERSONALITIES[s].name}
            detail={PERSONALITIES[s].tagline}
            onPress={() => {
              onPick(s);
              onClose();
            }}
            testID={`picker-${s}`}
            trailing={
              <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: s === value ? t.colors.primary : t.colors.border, alignItems: 'center', justifyContent: 'center' }}>
                {s === value ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: t.colors.primary }} /> : null}
              </View>
            }
          />
        ))}
      </View>
    </Sheet>
  );
}
