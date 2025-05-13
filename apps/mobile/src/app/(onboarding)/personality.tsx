import { PERSONALITIES, comedyStyles } from '@bot-friend/shared';
import { router } from 'expo-router';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BotBubblePreview } from '@/components/chat/BotBubblePreview';
import { Mascot } from '@/components/mascot/Mascot';
import { Button, IconButton, Tactile, Text } from '@/components/ui';
import { STYLE_MOOD } from '@/lib/personality';
import { usePrefs } from '@/lib/prefs';
import { useTheme } from '@/theme/theme';

export default function Personality() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const style = usePrefs((s) => s.prefs.comedyStyle);
  const color = usePrefs((s) => s.prefs.mascotColor);
  const patch = usePrefs((s) => s.patch);

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: t.colors.background,
        paddingTop: insets.top + t.space[2],
        paddingBottom: insets.bottom + t.space[5],
      }}
    >
      <View style={{ paddingHorizontal: t.space[3] }}>
        <IconButton icon="back" label="Back" onPress={() => router.back()} />
      </View>
      <View style={{ paddingHorizontal: t.space[6], flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[4] }}>
          <View style={{ flex: 1 }}>
            <Text variant="title" accessibilityRole="header">
              Pick my vibe
            </Text>
            <Text tone="muted" style={{ marginTop: t.space[1] }}>
              Change it any time in Customize.
            </Text>
          </View>
          <Mascot size={72} mood={STYLE_MOOD[style]} color={color} />
        </View>

        <View
          accessibilityRole="radiogroup"
          accessibilityLabel="Comedy style"
          style={{ marginTop: t.space[6], gap: t.space[2] }}
        >
          {comedyStyles.map((s) => {
            const p = PERSONALITIES[s];
            const active = s === style;
            return (
              <Tactile
                key={s}
                testID={`style-${s}`}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`${p.name}. ${p.tagline}`}
                onPress={() => patch({ comedyStyle: s })}
                haptic="select"
                squish={0.98}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: t.space[3],
                  paddingVertical: t.space[3],
                  paddingHorizontal: t.space[4],
                  borderRadius: t.radius.card,
                  borderWidth: 2,
                  borderColor: active ? t.colors.primary : 'transparent',
                  backgroundColor: active ? t.colors.surface : 'transparent',
                }}
              >
                <View
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 11,
                    borderWidth: 2,
                    borderColor: active ? t.colors.primary : t.colors.border,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {active ? (
                    <View
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: 5,
                        backgroundColor: t.colors.primary,
                      }}
                    />
                  ) : null}
                </View>
                <View style={{ flex: 1 }}>
                  <Text variant="subheading" display weight="semibold">
                    {p.name}
                  </Text>
                  <Text variant="caption" tone="muted">
                    {p.tagline}
                  </Text>
                </View>
              </Tactile>
            );
          })}
        </View>

        <View style={{ marginTop: t.space[6] }}>
          <BotBubblePreview text={PERSONALITIES[style].sample} />
        </View>
      </View>
      <View style={{ paddingHorizontal: t.space[6] }}>
        <Button
          label="Sounds good"
          size="lg"
          onPress={() => router.push('/signin')}
          testID="personality-continue"
        />
      </View>
    </View>
  );
}
