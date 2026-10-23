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
  const navigation = useRootNavigationState();
  const router = useRouter();
  useEffect(() => {
    if (!tap || !navigation?.key || isLoading) return;
    if (!session || tap.userId !== session.user.id) {
      clearTap();
      return;
    }
    if (!child.data) return;
    const destination = tapDestination(tap, session.user.id, child.data.id);
    clearTap();
    if (!destination) return;
    // Revoke parent access before presenting the existing PIN gate, including
    // when the notification was opened from an already-active parent screen.
    useAppModeStore.getState().setMode('child');
    if (destination === 'pin') requestGate();
    router.replace('/child/today');
  }, [tap, navigation?.key, isLoading, session, child.data, router, clearTap, requestGate]);
  return null;
}
