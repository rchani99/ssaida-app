import { getSupabaseClient } from '@/lib/supabase/client';

// Do not put PINs in query/mutation caches, stores, logs, or persisted state.
export async function verifyParentPin(pin: string): Promise<'valid' | 'invalid' | 'locked'> {
  const { data, error } = await getSupabaseClient().rpc('verify_parent_pin', { parent_pin: pin });
  if (error) throw new Error('PIN을 확인하지 못했어요. 잠시 후 다시 시도해 주세요.');
  if (data === null) return 'locked';
  return data === true ? 'valid' : 'invalid';
}
