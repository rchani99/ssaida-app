import { getSupabaseClient } from '@/lib/supabase/client';

import type { SensitivePurpose } from '@/features/auth/services/sensitive-action-flow';

export type PendingSensitiveAction = {
  purpose: SensitivePurpose;
  availableAt: string;
  expiresAt: string;
};

// Display-only read for the countdown banner. The RPC resolves the owner from auth.uid()
// and returns no identifier, so this can never be used to act on a request.
export async function fetchPendingSensitiveActions(): Promise<PendingSensitiveAction[]> {
  const { data, error } = await getSupabaseClient().rpc('list_pending_sensitive_actions');
  if (error) throw new Error('PENDING_UNAVAILABLE');
  return (data ?? []).flatMap((row) =>
    (row.purpose === 'delete_account' || row.purpose === 'reset_parent_pin') &&
    typeof row.available_at === 'string' &&
    typeof row.expires_at === 'string' &&
    Number.isFinite(Date.parse(row.available_at)) &&
    Number.isFinite(Date.parse(row.expires_at))
      ? [{ purpose: row.purpose, availableAt: row.available_at, expiresAt: row.expires_at }]
      : [],
  );
}

export function describeRemaining(availableAt: string, now = Date.now()) {
  const remaining = Date.parse(availableAt) - now;
  if (!Number.isFinite(remaining) || remaining <= 0) return null;
  const hours = Math.ceil(remaining / 3600000);
  return hours >= 48 ? `${Math.ceil(hours / 24)}일` : `${hours}시간`;
}
