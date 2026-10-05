import { accountRecovery } from '@/features/auth/services/account-recovery';
import { isDeletionReceipt } from '@/features/auth/services/account-recovery-state';
import { createSensitiveActionFlow } from '@/features/auth/services/sensitive-action-flow';
import { registerDeletionCleanup } from '@/features/notifications/storage';
import { getSupabaseClient } from '@/lib/supabase/client';

// clearNotifications must be NotificationProvider.clearDeletedAccount, which drains its queue.
export function createAccountActions({
  clearNotifications,
}: {
  clearNotifications(userId: string): Promise<void>;
}) {
  const client = getSupabaseClient();
  registerDeletionCleanup(clearNotifications);
  return createSensitiveActionFlow({
    currentUserId: async () => (await client.auth.getSession()).data.session?.user.id ?? null,
    async invoke(body) {
      if (body.action === 'begin' && (await accountRecovery.read()))
        throw new Error('RECOVERY_REQUIRED');
      const deleting = body.action === 'delete';
      const userId = (await client.auth.getSession()).data.session?.user.id;
      let request = body;
      if (deleting) {
        if (!userId) throw new Error('AUTH_REQUIRED');
        if (await accountRecovery.read()) throw new Error('RECOVERY_REQUIRED');
        const prepared = await client.functions.invoke('account-actions', {
          body: { action: 'prepare_delete', id: body.id },
        });
        if (prepared.error || !isDeletionReceipt(prepared.data))
          throw new Error('DELETE_PREPARATION_FAILED');
        await accountRecovery.prepare(userId, prepared.data);
        request = { ...body, operationId: prepared.data.operationId };
      }
      try {
        const { data, error } = await client.functions.invoke('account-actions', { body: request });
        if (error || !data || data.code) {
          let code = data?.code;
          if (error?.context instanceof Response) {
            try {
              code = (await error.context.json()).code;
            } catch {
              /* unknown outcome */
            }
          }
          // Only codes emitted BEFORE this request can call Admin deletion are definitive.
          // DELETE_FAILED, transport failures and malformed responses remain unconfirmed.
          const notExecuted = [
            'AUTH_REQUIRED',
            'GOOGLE_IDENTITY_REQUIRED',
            'INVALID_REQUEST',
            'WAIT_REQUIRED',
            'NOT_CANCELLABLE',
            'ACTION_UNAVAILABLE',
            'NOT_CONFIGURED',
            'REQUEST_TOO_LARGE',
            'JSON_REQUIRED',
          ];
          if (deleting && notExecuted.includes(code)) await accountRecovery.rejected(userId!);
          throw new Error(
            deleting
              ? '삭제 결과를 확인하지 못했어요. 기기 데이터는 유지됩니다.'
              : '계정 작업을 완료하지 못했어요. 대기 상태를 다시 확인해 주세요.',
          );
        }
        if (deleting) {
          if (data.status !== 'deleted') throw new Error('DELETE_OUTCOME_UNKNOWN');
          await accountRecovery.confirmed(userId!);
        }
        return data;
      } catch {
        // Persisted unconfirmed state survives response loss. Never infer deletion from 401 alone.
        throw new Error(
          deleting ? '삭제 결과 또는 기기 정리 상태 확인이 필요해요.' : '다시 시도해 주세요.',
        );
      }
    },
    async cleanupDeletedAccount() {
      await accountRecovery.resume();
      // RecoveryGate remounts AuthProvider only after cleanup; the existing auth guard shows login.
    },
  });
}
export type AccountActions = ReturnType<typeof createAccountActions>;
