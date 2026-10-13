import { accountRecovery } from '@/features/auth/services/account-recovery';
import { isDeletionReceipt } from '@/features/auth/services/account-recovery-state';
import { getSupabaseClient } from '@/lib/supabase/client';

let running: Promise<void> | null = null;

// Acquire a read-only receipt on another device too. This never requests deletion.
export function ensureDeletionWatch(): Promise<void> {
  if (running) return running;
  running = (async () => {
    const client = getSupabaseClient();
    const userId = (await client.auth.getSession()).data.session?.user.id;
    if (!userId) return;
    const marker = await accountRecovery.read();
    if (marker && (marker.phase !== 'watching' || marker.userId === userId)) return;
    const request = await client.functions.invoke('account-actions', {
      body: { action: 'resume', purpose: 'delete_account' },
    });
    if (request.error || !request.data?.id) throw new Error('WATCH_UNAVAILABLE');
    const result = await client.functions.invoke('account-actions', {
      body: { action: 'watch_delete', id: request.data.id },
    });
    if (result.error || !isDeletionReceipt(result.data)) throw new Error('WATCH_UNAVAILABLE');
    if ((await client.auth.getSession()).data.session?.user.id !== userId) return;
    await accountRecovery.watch(userId, result.data);
  })().finally(() => {
    running = null;
  });
  return running;
}
