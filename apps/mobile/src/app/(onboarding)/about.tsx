import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Mascot } from '@/components/mascot/Mascot';
import { Button, IconButton, Text } from '@/components/ui';
import { useTheme } from '@/theme/theme';

const FACTS = [
  {
    title: 'I’m an AI, not a person.',
    body: 'I can get things wrong, and I’ll say so when I’m not sure.',
  },
  {
    title: 'I’m here for fun, not therapy.',
    body: 'If things get serious, I’ll drop the jokes and point you to real help.',
  },
  {
    title: 'You’re in control.',
    body: 'Delete any chat, or your whole account, whenever you like.',
  },
];

export default function About() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [ineligible, setIneligible] = useState(false);

  if (ineligible) {
    return (
      <View
        style={{
          flex: 1,
          padding: t.space[6],
          paddingTop: insets.top + t.space[10],
          backgroundColor: t.colors.background,
        }}
      >
        <Mascot size={120} mood="sleepy" />
        <Text variant="title" accessibilityRole="header" style={{ marginTop: t.space[6] }}>
          Bot-Friend is for adults
        </Text>
        <Text tone="muted" style={{ marginTop: t.space[3] }}>
          You need to be 18 or older to use Bot-Friend. Thanks for being honest.
        </Text>
      </View>
    );
  }

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
      <View style={{ flex: 1, paddingHorizontal: t.space[6], paddingTop: t.space[4] }}>
        <Text variant="title" accessibilityRole="header">
          Quick heads-up
        </Text>
        <View style={{ marginTop: t.space[6], gap: t.space[5] }}>
          {FACTS.map((f) => (
            <View key={f.title} style={{ flexDirection: 'row', gap: t.space[3] }}>
              <View
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 5,
                  marginTop: 7,
                  backgroundColor: t.colors.accentWarm,
                }}
              />
              <View style={{ flex: 1 }}>
                <Text weight="semibold">{f.title}</Text>
                <Text tone="muted" style={{ marginTop: 2 }}>
                  {f.body}
                </Text>
              </View>
            </View>
          ))}
        </View>
      </View>
      <View style={{ paddingHorizontal: t.space[6], gap: t.space[3] }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: t.space[3],
            marginBottom: t.space[2],
          }}
        >
          <Mascot size={44} mood="idle" />
          <Text weight="semibold" style={{ flex: 1 }}>
            Are you 18 or older?
          </Text>
        </View>
        <Button
          label="Yes, I’m 18+"
          size="lg"
          onPress={() => router.push('/personality')}
          testID="age-yes"
        />
        <Button
          label="No, I’m under 18"
          variant="secondary"
          onPress={() => setIneligible(true)}
          testID="age-no"
        />
      </View>
    </View>
  );
}
