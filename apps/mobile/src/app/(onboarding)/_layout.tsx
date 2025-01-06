import { Stack } from 'expo-router';
import { useTheme } from '@/theme/theme';

export default function OnboardingLayout() {
  const t = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: t.colors.background },
        animation: t.reducedMotion ? 'none' : 'slide_from_right',
      }}
    />
  );
}
