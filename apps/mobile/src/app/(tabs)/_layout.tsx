import { Tabs } from 'expo-router';
import { View } from 'react-native';
import { Icon, type IconName } from '@/components/ui';
import { useTheme } from '@/theme/theme';

const TABS: Array<{ name: string; title: string; icon: IconName }> = [
  { name: 'index', title: 'Chat', icon: 'chat' },
  { name: 'play', title: 'Play', icon: 'play' },
  { name: 'customize', title: 'Customize', icon: 'sliders' },
  { name: 'profile', title: 'Profile', icon: 'user' },
];

export default function TabsLayout() {
  const t = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: t.colors.primaryText,
        tabBarInactiveTintColor: t.colors.textMuted,
        tabBarLabelStyle: { fontFamily: t.font.bodySemibold, fontSize: 12 },
        tabBarStyle: {
          backgroundColor: t.colors.surface,
          borderTopColor: t.colors.border,
          height: 64,
          paddingTop: 6,
        },
        animation: t.reducedMotion ? 'none' : 'fade',
      }}
    >
      {TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.title,
            tabBarAccessibilityLabel: tab.title,
            tabBarIcon: ({ color, focused }) => (
              <View
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 3,
                  borderRadius: 999,
                  backgroundColor: focused ? t.colors.primarySoft : 'transparent',
                }}
              >
                <Icon
                  name={tab.icon}
                  size={22}
                  color={String(color)}
                  strokeWidth={focused ? 2.4 : 2}
                />
              </View>
            ),
          }}
        />
      ))}
    </Tabs>
  );
}
