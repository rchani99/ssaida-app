import { DefaultTheme, SplashScreen, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { colors } from '@/design-system/tokens';
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
    <>
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
          </Stack.Protected>
          <Stack.Screen name="study/[taskId]" />
        </Stack.Protected>
        <Stack.Screen name="auth/callback" />
      </Stack>
      {isAuthenticated && !needsOnboarding && <NotificationRouting />}
    </>
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
