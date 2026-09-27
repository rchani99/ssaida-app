import { Tabs } from 'expo-router';
import { BookOpen, Sprout } from 'lucide-react-native';

import { dashboardIconProps } from '@/design-system/icons';
import { colors, dashboardTokens as t } from '@/design-system/tokens';
import { ParentModeButton } from '@/features/auth/components/parent-mode-button';
import { useNotifications } from '@/features/notifications/notification-context';

export default function ChildTabsLayout() {
  const { gateRequest, clearGate } = useNotifications();
  return (
    <Tabs
      screenOptions={{
        tabBarLabelPosition: 'below-icon',
        tabBarLabelStyle: { ...t.typography.caption, textAlign: 'center' },
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
      <Tabs.Screen
        name="today"
        options={{
          title: '오늘 공부',
          tabBarIcon: ({ color }) => (
            <BookOpen {...dashboardIconProps} color={color} size={t.icon.size.large} />
          ),
          headerTitleAlign: 'left',
          headerTitleStyle: t.typography.header,
          headerTintColor: t.colors.textPrimary,
          headerStyle: { backgroundColor: t.colors.card },
          headerRight: () => (
            <ParentModeButton compact openRequest={gateRequest} onOpenRequestHandled={clearGate} />
          ),
        }}
      />
      <Tabs.Screen
        name="garden"
        options={{
          title: '내 컬렉션',
          tabBarLabel: '정원',
          headerTitleAlign: 'left',
          headerTitleStyle: t.typography.header,
          headerRight: () => (
            <ParentModeButton compact openRequest={gateRequest} onOpenRequestHandled={clearGate} />
          ),
          tabBarIcon: ({ color }) => (
            <Sprout {...dashboardIconProps} color={color} size={t.icon.size.large} />
          ),
        }}
      />
    </Tabs>
  );
}
