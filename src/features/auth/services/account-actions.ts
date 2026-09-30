import { createSensitiveActionFlow } from '@/features/auth/services/sensitive-action-flow';
import { queryClient } from '@/lib/query-client';
import { getSupabaseClient } from '@/lib/supabase/client';
import { useAppModeStore } from '@/store/app-mode.store';

// Not wired into UI until the Google proof adapter and external configuration are verified.
// clearNotifications must be NotificationProvider.clearDeletedAccount, which drains its queue.
export function createAccountActions({
  clearNotifications,
  onSignedOut,
}: {
  clearNotifications(userId: string): Promise<void>;
  onSignedOut(): void;
}) {
  const client = getSupabaseClient();
  return createSensitiveActionFlow({
    currentUserId: async () => (await client.auth.getSession()).data.session?.user.id ?? null,
    async invoke(body) {
      const { data, error } = await client.functions.invoke('account-actions', { body });
      if (error || !data || data.code)
        throw new Error('계정 작업을 완료하지 못했어요. 다시 인증해 주세요.');
      return data;
    },
    async cleanupDeletedAccount(userId) {
      const current = (await client.auth.getSession()).data.session?.user.id;
      if (current && current !== userId) throw new Error('ACCOUNT_CHANGED');
      // A confirmed remote deletion cannot be rolled back. Attempt every cleanup even if one fails.
      const outcomes = await Promise.allSettled([
        clearNotifications(userId),
        queryClient.cancelQueries(),
      ]);
      const afterDrain = (await client.auth.getSession()).data.session?.user.id;
      if (afterDrain && afterDrain !== userId) throw new Error('ACCOUNT_CHANGED');
      queryClient.clear();
      useAppModeStore.getState().setMode('child');
      const { error } = await client.auth.signOut({ scope: 'local' });
      onSignedOut();
      if (error || outcomes.some((result) => result.status === 'rejected')) {
        throw new Error(
          '계정은 삭제됐지만 기기 정리가 완료되지 않았어요. 앱을 다시 열어 확인해 주세요.',
        );
      }
    },
  });
}
