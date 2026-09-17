import { Tabs } from 'expo-router';

import { colors } from '@/design-system/tokens';
import { ChildModeButton } from '@/features/auth/components/child-mode-button';

export default function ParentTabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerRight: () => <ChildModeButton />,
        headerStyle: { backgroundColor: colors.card },
        headerTintColor: colors.textPrimary,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border },
      }}
    >
      <Tabs.Screen name="home" options={{ title: '홈' }} />
      <Tabs.Screen name="records" options={{ title: '기록' }} />
      <Tabs.Screen name="settings" options={{ title: '설정' }} />
    </Tabs>
  );
}
