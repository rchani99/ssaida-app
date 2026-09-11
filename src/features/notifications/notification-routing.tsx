import { useRootNavigationState, useRouter } from 'expo-router';
import { useEffect } from 'react';

import { useAuth } from '@/features/auth/hooks/use-auth';
import { useCurrentChild } from '@/features/learning/hooks/use-learning';
import { useNotifications } from '@/features/notifications/notification-context';
import { tapDestination } from '@/features/notifications/planner';
import { useAppModeStore } from '@/store/app-mode.store';

export function NotificationRouting() {
  const { tap, clearTap, requestGate } = useNotifications();
  const { session, isLoading } = useAuth();
  const child = useCurrentChild();
  const mode = useAppModeStore((state) => state.mode);
  const navigation = useRootNavigationState();
  const router = useRouter();
  useEffect(() => {
    if (!tap || !navigation?.key || isLoading) return;
    if (!session || tap.userId !== session.user.id) {
      clearTap();
      return;
    }
    if (!child.data) return;
    const destination = tapDestination(tap, session.user.id, child.data.id, mode);
    clearTap();
    if (!destination) return;
    if (destination === 'parent') router.replace('/parent/home');
    else {
      if (destination === 'pin') requestGate();
      else useAppModeStore.getState().setMode('child');
      router.replace('/child/today');
    }
  }, [tap, navigation?.key, isLoading, session, child.data, mode, router, clearTap, requestGate]);
  return null;
}
