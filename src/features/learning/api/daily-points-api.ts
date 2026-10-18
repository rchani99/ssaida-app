import { getSupabaseClient } from '@/lib/supabase/client';

export async function fetchDailyPoints(childId: string, date: string) {
  const start = new Date(`${date}T00:00:00+09:00`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  let millionths = 0;
  let unrecordedCount = 0;
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await getSupabaseClient()
      .from('daily_tasks')
      .select('id,awarded_growth_points,daily_plans!inner(child_id)')
      .eq('daily_plans.child_id', childId)
      .in('status', ['PARENT_CONFIRMED', 'PARTIAL'])
      .gte('parent_verified_at', start.toISOString())
      .lt('parent_verified_at', end.toISOString())
      .order('id')
      .range(offset, offset + 499);
    if (error) throw error;
    for (const task of data) {
      if (task.awarded_growth_points === null) unrecordedCount++;
      else millionths += Math.round(task.awarded_growth_points * 1_000_000);
    }
    if (data.length < 500) return { points: millionths / 1_000_000, unrecordedCount };
  }
}
