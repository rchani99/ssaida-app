import { Tabs } from 'expo-router';

import { colors } from '@/design-system/tokens';

export default function ChildTabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.card },
        headerTintColor: colors.textPrimary,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border },
      }}
    >
      <Tabs.Screen name="today" options={{ title: '오늘 공부' }} />
      <Tabs.Screen name="garden" options={{ title: '정원' }} />
    </Tabs>
  );
}
