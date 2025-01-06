import { BricolageGrotesque_600SemiBold } from '@expo-google-fonts/bricolage-grotesque/600SemiBold';
import { BricolageGrotesque_700Bold } from '@expo-google-fonts/bricolage-grotesque/700Bold';
import { BricolageGrotesque_800ExtraBold } from '@expo-google-fonts/bricolage-grotesque/800ExtraBold';
import { Figtree_400Regular } from '@expo-google-fonts/figtree/400Regular';
import { Figtree_500Medium } from '@expo-google-fonts/figtree/500Medium';
import { Figtree_600SemiBold } from '@expo-google-fonts/figtree/600SemiBold';
import { Figtree_700Bold } from '@expo-google-fonts/figtree/700Bold';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect, useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ApiClientError } from '@/lib/api/client';
import { useMe } from '@/lib/api/hooks';
import { usePrefs } from '@/lib/prefs';
import { useSession } from '@/lib/session';
import { ThemeProvider, useTheme } from '@/theme/theme';

void SplashScreen.preventAutoHideAsync().catch(() => undefined);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (count, err) => count < 2 && (!(err instanceof ApiClientError) || err.retryable),
    },
  },
});

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    BricolageGrotesque_600SemiBold,
    BricolageGrotesque_700Bold,
    BricolageGrotesque_800ExtraBold,
    Figtree_400Regular,
    Figtree_500Medium,
    Figtree_600SemiBold,
    Figtree_700Bold,
  });
  const [storesReady, setStoresReady] = useState(false);
  useEffect(() => {
    void Promise.all([useSession.getState().hydrate(), usePrefs.getState().loadLocal()]).finally(() => setStoresReady(true));
  }, []);

  const ready = (fontsLoaded || !!fontError) && storesReady;
  useEffect(() => {
    if (ready) void SplashScreen.hideAsync().catch(() => undefined);
  }, [ready]);

  const prefs = usePrefs((s) => s.prefs);
  if (!ready) return null;

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider settings={{ theme: prefs.theme, reducedMotion: prefs.reducedMotion, largeText: prefs.largeText }}>
          <AppNavigator />
        </ThemeProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

function AppNavigator() {
  const t = useTheme();
  const status = useSession((s) => s.status);
  const signedIn = status === 'signedIn';
  // Keep server preferences in sync once signed in.
  useMe();

  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(t.colors.background).catch(() => undefined);
  }, [t.colors.background]);

  return (
    <>
      <StatusBar style={t.dark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: t.colors.background },
          animation: t.reducedMotion ? 'none' : 'default',
        }}
      >
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="(onboarding)" />
        </Stack.Protected>
        <Stack.Protected guard={signedIn}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="chat/[id]" />
        </Stack.Protected>
      </Stack>
    </>
  );
}
