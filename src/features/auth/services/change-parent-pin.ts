import { getSupabaseClient } from '@/lib/supabase/client';

export type ChangeParentPinResult = 'changed' | 'invalid' | 'locked' | 'same';

// PIN values are sent directly to the RPC and must never enter caches or persistent storage.
export async function changeParentPin(
  currentPin: string,
  newPin: string,
): Promise<ChangeParentPinResult> {
  const { data, error } = await getSupabaseClient().rpc('change_parent_pin', {
    current_pin: currentPin,
    new_pin: newPin,
  });
  if (error) throw new Error('PIN을 변경하지 못했어요. 다시 시도해 주세요.');
  if (data === 'changed' || data === 'invalid' || data === 'locked' || data === 'same') return data;
  throw new Error('PIN 변경 결과를 확인하지 못했어요.');
}
