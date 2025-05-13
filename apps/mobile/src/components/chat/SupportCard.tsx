import * as Linking from 'expo-linking';
import { View } from 'react-native';
import { Button, Text } from '@/components/ui';
import { useTheme } from '@/theme/theme';

/** Shown instead of a joke when someone may be at risk. Calm, plain, no mascot antics. */
export function SupportCard({ text }: { text: string }) {
  const t = useTheme();
  return (
    <View
      accessibilityRole="summary"
      style={{
        backgroundColor: t.dark ? t.colors.surfaceRaised : t.colors.accentCalm,
        borderRadius: t.radius.card,
        padding: t.space[4],
        gap: t.space[3],
      }}
    >
      <Text weight="semibold" tone="calm">
        You’re not alone
      </Text>
      <Text style={{ color: t.dark ? t.colors.text : '#123B28' }}>{text}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space[2] }}>
        <Button
          label="Call 988"
          variant="secondary"
          onPress={() => void Linking.openURL('tel:988')}
        />
        <Button
          label="Text 988"
          variant="secondary"
          onPress={() => void Linking.openURL('sms:988')}
        />
        <Button
          label="Find help abroad"
          variant="ghost"
          onPress={() => void Linking.openURL('https://findahelpline.com')}
        />
      </View>
    </View>
  );
}
