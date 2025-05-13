import * as AppleAuthentication from 'expo-apple-authentication';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Mascot } from '@/components/mascot/Mascot';
import { Button, IconButton, Text } from '@/components/ui';
import { GoogleSignInButton, googleEnabled } from '@/components/auth/GoogleSignInButton';
import { ApiClientError, api } from '@/lib/api/client';
import { createSession } from '@/lib/api/hooks';
import { config } from '@/lib/config';
import { usePrefs } from '@/lib/prefs';
import { useSession } from '@/lib/session';
import { useTheme } from '@/theme/theme';

type Provider = 'guest' | 'apple' | 'google' | 'dev';

export default function SignIn() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const session = useSession();
  const [busy, setBusy] = useState<Provider | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [devEmail, setDevEmail] = useState('');

  useEffect(() => {
    if (Platform.OS === 'ios')
      void AppleAuthentication.isAvailableAsync()
        .then(setAppleAvailable)
        .catch(() => undefined);
  }, []);

  async function finish(provider: Provider, extra: Record<string, string>) {
    setBusy(provider);
    setError(null);
    try {
      const res = await createSession({
        provider,
        ageConfirmed: true,
        ...(provider === 'guest'
          ? session.guestToken
            ? { guestToken: session.guestToken }
            : {}
          : session.guestToken
            ? { upgradeGuestToken: session.guestToken }
            : {}),
        ...extra,
      } as never);
      // Carry choices made during onboarding over to the account *before* the session
      // flips the navigator, otherwise the first /me fetch would overwrite them.
      if (!session.onboarded) {
        const { comedyStyle, theme, mascotColor, reducedMotion, largeText } =
          usePrefs.getState().prefs;
        await api(
          'PATCH',
          '/v1/me/preferences',
          { comedyStyle, theme, mascotColor, reducedMotion, largeText },
          { token: res.accessToken },
        ).catch(() => undefined);
      }
      await session.setOnboarded(true);
      await session.setSession(res);
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : 'Sign-in didn’t finish. Try again, or continue as a guest.',
      );
    } finally {
      setBusy(null);
    }
  }

  async function signInWithApple() {
    try {
      const cred = await AppleAuthentication.signInAsync({
        requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME],
      });
      if (!cred.identityToken) throw new Error('missing token');
      await finish('apple', { idToken: cred.identityToken });
    } catch (err) {
      if ((err as { code?: string }).code === 'ERR_REQUEST_CANCELED') return;
      setError('Apple sign-in didn’t finish. Try again.');
    }
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
        {router.canGoBack() ? (
          <IconButton icon="back" label="Back" onPress={() => router.back()} />
        ) : (
          <View style={{ height: 44 }} />
        )}
      </View>
      <View style={{ flex: 1, paddingHorizontal: t.space[6], paddingTop: t.space[4] }}>
        <Mascot
          size={88}
          mood={error ? 'surprised' : 'happy'}
          color={usePrefs.getState().prefs.mascotColor}
        />
        <Text variant="title" accessibilityRole="header" style={{ marginTop: t.space[5] }}>
          {session.onboarded ? 'Welcome back' : 'Save your chats?'}
        </Text>
        <Text tone="muted" style={{ marginTop: t.space[2] }}>
          Sign in to keep your conversations and settings across devices. Or just try me out first.
        </Text>
        {error ? (
          <View
            accessibilityLiveRegion="polite"
            style={{
              marginTop: t.space[5],
              padding: t.space[4],
              borderRadius: t.radius.card,
              backgroundColor: t.colors.dangerSoft,
            }}
          >
            <Text tone="danger" weight="medium">
              {error}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={{ paddingHorizontal: t.space[6], gap: t.space[3] }}>
        {appleAvailable ? (
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
            buttonStyle={
              t.dark
                ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
            }
            cornerRadius={t.radius.button}
            style={{ height: 52 }}
            onPress={signInWithApple}
          />
        ) : null}
        {googleEnabled ? (
          <GoogleSignInButton
            busy={busy === 'google'}
            onToken={(idToken) => finish('google', { idToken })}
            onError={() => setError('Google sign-in didn’t finish. Try again.')}
          />
        ) : null}
        {config.devLogin ? (
          <View style={{ flexDirection: 'row', gap: t.space[2] }}>
            <TextInput
              value={devEmail}
              onChangeText={setDevEmail}
              placeholder="dev email"
              placeholderTextColor={t.colors.textMuted}
              autoCapitalize="none"
              keyboardType="email-address"
              accessibilityLabel="Developer email"
              style={{
                flex: 1,
                borderWidth: 1.5,
                borderColor: t.colors.border,
                borderRadius: t.radius.button,
                paddingHorizontal: t.space[4],
                color: t.colors.text,
                backgroundColor: t.colors.surface,
                fontFamily: t.font.body,
              }}
            />
            <Button
              label="Dev sign-in"
              variant="secondary"
              loading={busy === 'dev'}
              disabled={!devEmail.includes('@')}
              onPress={() => finish('dev', { email: devEmail.trim() })}
            />
          </View>
        ) : null}
        <Button
          label={session.guestToken ? 'Continue as guest' : 'Try as a guest'}
          variant={appleAvailable || googleEnabled ? 'secondary' : 'primary'}
          size="lg"
          loading={busy === 'guest'}
          onPress={() => finish('guest', {})}
          testID="signin-guest"
        />
        <Text variant="caption" tone="muted" align="center">
          Guest trial: 20 messages a day. Guest chats are deleted after 7 days.
        </Text>
      </View>
    </View>
  );
}
