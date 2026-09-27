import { Tabs } from 'expo-router';
import { ChartColumn, ClipboardList, House, Settings } from 'lucide-react-native';

import { dashboardIconProps } from '@/design-system/icons';
import { colors, dashboardTokens as t } from '@/design-system/tokens';
import { ChildModeButton } from '@/features/auth/components/child-mode-button';

export default function ParentTabsLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarLabelPosition: 'below-icon',
        tabBarLabelStyle: { ...t.typography.caption, textAlign: 'center' },
        headerRight: () => <ChildModeButton dashboard />,
        headerStyle: { backgroundColor: colors.card },
        headerTintColor: colors.textPrimary,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: '대시보드',
          tabBarIcon: ({ color }) => (
            <House {...dashboardIconProps} color={color} size={t.icon.size.large} />
          ),
        }}
      />
      <Tabs.Screen
        name="study-management"
        options={{
          title: '공부 관리',
          tabBarIcon: ({ color }) => (
            <ClipboardList {...dashboardIconProps} color={color} size={t.icon.size.large} />
          ),
        }}
      />
      <Tabs.Screen
        name="records"
        options={{
          title: '기록',
          tabBarIcon: ({ color }) => (
            <ChartColumn {...dashboardIconProps} color={color} size={t.icon.size.large} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: '설정',
          tabBarIcon: ({ color }) => (
            <Settings {...dashboardIconProps} color={color} size={t.icon.size.large} />
          ),
        }}
      />
    </Tabs>
  );
}
