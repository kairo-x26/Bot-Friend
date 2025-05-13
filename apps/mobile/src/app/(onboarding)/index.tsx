import { Redirect, router } from 'expo-router';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Mascot } from '@/components/mascot/Mascot';
import { Starfield } from '@/components/mascot/Starfield';
import { Button, Text } from '@/components/ui';
import { usePrefs } from '@/lib/prefs';
import { useSession } from '@/lib/session';
import { useTheme } from '@/theme/theme';

export default function Welcome() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const onboarded = useSession((s) => s.onboarded);
  const mascotColor = usePrefs((s) => s.prefs.mascotColor);

  // Returning users whose session ended skip straight to sign-in.
  if (onboarded) return <Redirect href="/signin" />;

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: t.colors.background,
        paddingTop: insets.top,
        paddingBottom: insets.bottom + t.space[5],
      }}
    >
      <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: t.space[6] }}>
        <Starfield height={360} />
        <View style={{ alignItems: 'flex-start', marginBottom: t.space[8] }}>
          <Mascot size={176} mood="happy" color={mascotColor} interactive testID="welcome-mascot" />
        </View>
        <Text variant="hero" accessibilityRole="header">
          {'Hi, I’m\nBot-Friend.'}
        </Text>
        <Text variant="subheading" tone="muted" style={{ marginTop: t.space[3], maxWidth: 340 }}>
          Your favorite little weirdo, powered by AI. Here for jokes, games and good conversation.
        </Text>
      </View>
      <View style={{ paddingHorizontal: t.space[6], gap: t.space[2] }}>
        <Button
          label="Let’s get started"
          size="lg"
          onPress={() => router.push('/about')}
          testID="welcome-start"
        />
        <Button
          label="I already have an account"
          variant="ghost"
          onPress={() => router.push('/signin')}
        />
      </View>
    </View>
  );
}
