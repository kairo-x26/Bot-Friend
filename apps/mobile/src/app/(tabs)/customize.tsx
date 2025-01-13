import { PERSONALITIES, comedyStyles, mascotPalettes, type MascotColor } from '@bot-friend/shared';
import { View } from 'react-native';
import { BoundaryPicker } from '@/components/BoundaryPicker';
import { BotBubblePreview } from '@/components/chat/BotBubblePreview';
import { Mascot } from '@/components/mascot/Mascot';
import { Screen, Section, Segmented, Tactile, Text, Toggle } from '@/components/ui';
import { useUpdatePreferences } from '@/lib/api/hooks';
import { STYLE_MOOD } from '@/lib/personality';
import { usePrefs } from '@/lib/prefs';
import { useTheme } from '@/theme/theme';

const COLORS: Array<{ value: MascotColor; label: string }> = [
  { value: 'violet', label: 'Violet' },
  { value: 'peach', label: 'Peach' },
  { value: 'mint', label: 'Mint' },
  { value: 'lavender', label: 'Lavender' },
];

export default function Customize() {
  const t = useTheme();
  const prefs = usePrefs((s) => s.prefs);
  const update = useUpdatePreferences();
  const set = update.mutate;

  return (
    <Screen title="Customize" subtitle="Tune how Bot-Friend talks to you.">
      {/* live preview */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: t.space[3] }}>
        <Mascot size={96} mood={STYLE_MOOD[prefs.comedyStyle]} color={prefs.mascotColor} interactive />
        <View style={{ flex: 1, paddingBottom: t.space[2] }}>
          <BotBubblePreview text={PERSONALITIES[prefs.comedyStyle].sample} />
        </View>
      </View>

      <Section title="Vibe" framed={false}>
        <View accessibilityRole="radiogroup" accessibilityLabel="Comedy style" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space[2] }}>
          {comedyStyles.map((s) => {
            const active = prefs.comedyStyle === s;
            return (
              <Tactile
                key={s}
                testID={`customize-style-${s}`}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`${PERSONALITIES[s].name}. ${PERSONALITIES[s].tagline}`}
                onPress={() => set({ comedyStyle: s })}
                haptic="select"
                style={{
                  width: '48.5%',
                  padding: t.space[4],
                  borderRadius: t.radius.card,
                  backgroundColor: active ? t.colors.primary : t.colors.surface,
                  borderWidth: active ? 0 : 1,
                  borderColor: t.colors.border,
                  minHeight: 88,
                  gap: 4,
                }}
              >
                <Text variant="subheading" display weight="semibold" tone={active ? 'onPrimary' : 'default'}>
                  {PERSONALITIES[s].name}
                </Text>
                <Text variant="caption" tone={active ? 'onPrimary' : 'muted'}>
                  {PERSONALITIES[s].tagline}
                </Text>
              </Tactile>
            );
          })}
        </View>
      </Section>

      <Section title="Energy" framed={false}>
        <Segmented
          label="Energy"
          value={prefs.energy}
          onChange={(energy) => set({ energy })}
          options={[
            { value: 'low', label: 'Low-key' },
            { value: 'medium', label: 'Balanced' },
            { value: 'high', label: 'Hyper' },
          ]}
        />
      </Section>

      <Section title="Boundaries">
        <Toggle
          label="Allow playful roasts"
          description="Teasing about habits and choices, never about who you are."
          value={prefs.roastOptIn}
          onChange={(roastOptIn) => set({ roastOptIn })}
          testID="toggle-roasts"
        />
        <View style={{ paddingVertical: t.space[3], gap: t.space[3] }}>
          <Text weight="medium">Never joke about</Text>
          <BoundaryPicker value={prefs.humorBoundaries} onChange={(humorBoundaries) => set({ humorBoundaries })} />
        </View>
      </Section>

      <Section title="Look" framed={false}>
        <View accessibilityRole="radiogroup" accessibilityLabel="Mascot color" style={{ flexDirection: 'row', gap: t.space[4] }}>
          {COLORS.map((c) => {
            const active = prefs.mascotColor === c.value;
            return (
              <Tactile
                key={c.value}
                accessibilityRole="radio"
                accessibilityLabel={c.label}
                accessibilityState={{ selected: active }}
                onPress={() => set({ mascotColor: c.value })}
                haptic="select"
                squish={0.9}
                style={{ alignItems: 'center', gap: t.space[1] }}
              >
                <View
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: 26,
                    backgroundColor: mascotPalettes[c.value].body,
                    borderWidth: 3,
                    borderColor: active ? t.colors.focusRing : 'transparent',
                  }}
                />
                <Text variant="caption" tone={active ? 'default' : 'muted'} weight={active ? 'semibold' : 'regular'}>
                  {c.label}
                </Text>
              </Tactile>
            );
          })}
        </View>
      </Section>
      {update.isError ? <Text tone="danger">Couldn’t save that change. Check your connection.</Text> : null}
    </Screen>
  );
}
