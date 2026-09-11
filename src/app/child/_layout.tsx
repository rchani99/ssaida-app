import { Tabs } from 'expo-router';

import { colors } from '@/design-system/tokens';
import { ParentModeButton } from '@/features/auth/components/parent-mode-button';
import { useNotifications } from '@/features/notifications/notification-context';

export default function ChildTabsLayout() {
  const { gateRequest, clearGate } = useNotifications();
  return (
    <Tabs
      screenOptions={{
        headerRight: () => (
          <ParentModeButton openRequest={gateRequest} onOpenRequestHandled={clearGate} />
        ),
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
