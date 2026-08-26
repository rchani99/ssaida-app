import { getSupabaseClient } from '@/lib/supabase/client';

export type CompleteOnboardingInput = {
  childName: string;
  dailyTargetMinutes: number;
  parentPin: string;
};

export async function completeOnboarding(input: CompleteOnboardingInput): Promise<void> {
  const { error } = await getSupabaseClient().rpc('complete_parent_onboarding', {
    child_name: input.childName.trim(),
    target_minutes: input.dailyTargetMinutes,
    parent_pin: input.parentPin,
  });
  if (error) throw error;
}
