import { DefaultTheme, SplashScreen, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { View } from 'react-native';

import { colors } from '@/design-system/tokens';
import { ChildModeButton } from '@/features/auth/components/child-mode-button';
import { PendingAccountActionBanner } from '@/features/auth/components/pending-account-action-banner';
import { useAuth } from '@/features/auth/hooks/use-auth';
import { LoadingScreen } from '@/features/auth/screens/loading-screen';
import { NotificationRouting } from '@/features/notifications/notification-routing';
import { AppProviders } from '@/providers/app-providers';
import { useAppModeStore } from '@/store/app-mode.store';

const navigationTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: colors.primary,
    background: colors.background,
    card: colors.card,
    text: colors.textPrimary,
    border: colors.border,
  },
};

void SplashScreen.preventAutoHideAsync();

function RootNavigator() {
  const mode = useAppModeStore((state) => state.mode);
  const { isLoading, isAuthenticated, profile } = useAuth();
  const needsOnboarding = isAuthenticated && profile?.onboarding_completed !== true;

  useEffect(() => {
    if (!isLoading) {
      void SplashScreen.hideAsync();
    }
  }, [isLoading]);

  if (isLoading) {
    return <LoadingScreen />;
  }

  return (
    <View style={{ flex: 1 }}>
      {isAuthenticated && !needsOnboarding && <PendingAccountActionBanner />}
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Protected guard={!isAuthenticated}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
        <Stack.Protected guard={needsOnboarding}>
          <Stack.Screen name="(onboarding)" />
        </Stack.Protected>
        <Stack.Protected guard={isAuthenticated && !needsOnboarding}>
          <Stack.Screen name="index" />
          <Stack.Screen name="child" />
          <Stack.Protected guard={mode === 'parent'}>
            <Stack.Screen name="parent" />
            <Stack.Screen
              name="parent-review"
              options={{
                headerShown: true,
                title: '부모 확인',
                headerRight: () => <ChildModeButton dashboard />,
                headerStyle: { backgroundColor: colors.card },
                headerTintColor: colors.textPrimary,
              }}
            />
            <Stack.Screen
              name="parent-unresolved"
              options={{
                headerShown: true,
                title: '지난 공부 정리하기',
                headerRight: () => <ChildModeButton />,
                headerStyle: { backgroundColor: colors.card },
                headerTintColor: colors.textPrimary,
              }}
            />
            <Stack.Screen
              name="parent-today-edit"
              options={{
                headerShown: true,
                title: '오늘 공부 편집',
                headerRight: () => <ChildModeButton dashboard />,
                headerStyle: { backgroundColor: colors.card },
                headerTintColor: colors.textPrimary,
              }}
            />
            <Stack.Screen
              name="parent-records"
              options={{
                headerShown: true,
                title: '전체 학습 기록',
                headerRight: () => <ChildModeButton dashboard />,
                headerStyle: { backgroundColor: colors.card },
                headerTintColor: colors.textPrimary,
              }}
            />
          </Stack.Protected>
          <Stack.Screen name="study/[taskId]" />
        </Stack.Protected>
        <Stack.Screen name="auth/callback" />
      </Stack>
      {isAuthenticated && !needsOnboarding && <NotificationRouting />}
    </View>
  );
}

export default function RootLayout() {
  return (
    <AppProviders>
      <ThemeProvider value={navigationTheme}>
        <StatusBar style="dark" />
        <RootNavigator />
      </ThemeProvider>
    </AppProviders>
  );
}
