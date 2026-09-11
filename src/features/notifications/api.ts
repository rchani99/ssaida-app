import {
  fetchCurrentChild,
  fetchDailyPlan,
  fetchDailyTasks,
} from '@/features/learning/api/learning-api';
import { getSupabaseClient } from '@/lib/supabase/client';

import type { Snapshot } from '@/features/notifications/types';

export async function fetchNotificationSnapshot(
  userId: string,
  date: string,
): Promise<Snapshot | null> {
  const child = await fetchCurrentChild();
  if (!child) return null;
  const plan = await fetchDailyPlan(child.id, date);
  const tasks = plan ? await fetchDailyTasks(plan.id) : [];
  const pending: Snapshot['pending'] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await getSupabaseClient()
      .from('daily_tasks')
      .select('*,daily_plans!inner(child_id,day_type)')
      .eq('daily_plans.child_id', child.id)
      .eq('daily_plans.day_type', 'STUDY')
      .eq('status', 'CHILD_COMPLETED')
      .is('parent_verified_at', null)
      .not('child_completed_at', 'is', null)
      .order('id')
      .range(offset, offset + 499);
    if (error) throw new Error('알림 대상을 확인하지 못했어요.');
    pending.push(...data);
    if (data.length < 500) break;
  }
  return { userId, childId: child.id, date, plan, tasks, pending };
}
