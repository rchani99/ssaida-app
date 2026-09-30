import AsyncStorage from '@react-native-async-storage/async-storage';

import { createAccountRecovery } from '@/features/auth/services/account-recovery-state';
import { fetchDeletionStatus } from '@/features/auth/services/deletion-status';
import { notificationPort } from '@/features/notifications/notification-port';
import { clearNotices } from '@/features/notifications/reconcile';
import { drainDeletionCleanup, removePreferences } from '@/features/notifications/storage';
import { queryClient } from '@/lib/query-client';
import { getSupabaseClient } from '@/lib/supabase/client';
import { useAppModeStore } from '@/store/app-mode.store';

const KEY = 'ssaida.account_cleanup_pending.v1';
const listeners = new Set<() => void>();
export function subscribeAccountRecovery(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export const accountRecovery = createAccountRecovery({
  read: () => AsyncStorage.getItem(KEY),
  write: (value) => AsyncStorage.setItem(KEY, value),
  remove: () => AsyncStorage.removeItem(KEY),
  deletionStatus: fetchDeletionStatus,
  currentUserId: async () =>
    (await getSupabaseClient().auth.getSession()).data.session?.user.id ?? null,
  clearNotifications: async (userId) => {
    await drainDeletionCleanup(userId);
    await notificationPort.initialize();
    await clearNotices(notificationPort);
  },
  clearPreferences: removePreferences,
  clearCache: async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    useAppModeStore.getState().setMode('child');
  },
  clearSession: async () => {
    const client = getSupabaseClient();
    const { error } = await client.auth.signOut({ scope: 'local' });
    // Auth-js removes local state even on most network errors. Verify the local result;
    // a deleted user need not possess a working server session to finish device cleanup.
    const remaining = await client.auth.getSession();
    if (remaining.error || remaining.data.session) throw new Error('SESSION_CLEANUP_FAILED');
    if (error && error.name !== 'AuthRetryableFetchError' && error.name !== 'AuthApiError')
      throw new Error('SESSION_CLEANUP_FAILED');
  },
  changed: () => {
    for (const listener of listeners) listener();
  },
});
