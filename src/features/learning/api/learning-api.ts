import { getSupabaseClient } from '@/lib/supabase/client';

import type {
  CollectibleWithCatalog,
  ConfirmationInput,
  CreateStudyItemInput,
  DailyPlan,
  DailyTask,
  DailyTaskWithPlan,
} from '@/features/learning/types/learning.types';

function throwLearningError(context: string, error: unknown): asserts error is null {
  if (!error) return;
  if (__DEV__) console.error(`[learning] ${context}`, error);
  throw error;
}

export async function fetchCurrentChild() {
  const { data, error } = await getSupabaseClient().from('children').select('*').maybeSingle();
  throwLearningError('fetchCurrentChild', error);
  return data;
}

export async function fetchStudyItems(childId: string) {
  const { data, error } = await getSupabaseClient()
    .from('study_items')
    .select('*')
    .eq('child_id', childId)
    .neq('status', 'DELETED')
    .order('created_at');
  throwLearningError('fetchStudyItems', error);
  return data;
}

export async function createStudyItem(input: CreateStudyItemInput) {
  const { data, error } = await getSupabaseClient()
    .from('study_items')
    .insert({
      child_id: input.childId,
      item_type: input.itemType,
      name: input.name.trim(),
      subject: input.subject,
      estimated_minutes: input.estimatedMinutes,
      study_weekdays: input.studyWeekdays,
      workbook_pages_per_session:
        input.itemType === 'WORKBOOK' ? input.workbookPagesPerSession : null,
      workbook_last_page: input.itemType === 'WORKBOOK' ? input.workbookLastPage : null,
      workbook_last_completed_page: input.itemType === 'WORKBOOK' ? 0 : null,
    })
    .select('*')
    .single();
  throwLearningError('createStudyItem', error);
  return data;
}

export async function ensureDailyPlan(childId: string, planDate: string) {
  const { data, error } = await getSupabaseClient().rpc('ensure_daily_plan', {
    target_child_id: childId,
    target_plan_date: planDate,
  });
  throwLearningError('ensureDailyPlan', error);
  return data;
}

export async function fetchDailyPlan(childId: string, planDate: string): Promise<DailyPlan | null> {
  const { data, error } = await getSupabaseClient()
    .from('daily_plans')
    .select('*')
    .eq('child_id', childId)
    .eq('plan_date', planDate)
    .maybeSingle();
  throwLearningError('fetchDailyPlan', error);
  return data;
}

export async function fetchDailyTasks(dailyPlanId: string): Promise<DailyTask[]> {
  const { data, error } = await getSupabaseClient()
    .from('daily_tasks')
    .select('*')
    .eq('daily_plan_id', dailyPlanId)
    .order('sort_order');
  throwLearningError('fetchDailyTasks', error);
  return data;
}

export async function fetchContinuingTasks(
  childId: string,
  planDate: string,
): Promise<DailyTaskWithPlan[]> {
  const { data, error } = await getSupabaseClient()
    .from('daily_tasks')
    .select('*,daily_plans!inner(child_id,plan_date)')
    .eq('daily_plans.child_id', childId)
    .lt('daily_plans.plan_date', planDate)
    .in('status', ['IN_PROGRESS', 'RETRY'])
    .order('created_at');
  throwLearningError('fetchContinuingTasks', error);
  return data as DailyTaskWithPlan[];
}

export async function fetchPendingConfirmations(childId: string): Promise<DailyTaskWithPlan[]> {
  const { data, error } = await getSupabaseClient()
    .from('daily_tasks')
    .select('*,daily_plans!inner(child_id,plan_date)')
    .eq('daily_plans.child_id', childId)
    .eq('status', 'CHILD_COMPLETED')
    .order('child_completed_at');
  throwLearningError('fetchPendingConfirmations', error);
  return data as DailyTaskWithPlan[];
}

export async function fetchDailyTask(taskId: string) {
  const { data, error } = await getSupabaseClient()
    .from('daily_tasks')
    .select('*')
    .eq('id', taskId)
    .single();
  throwLearningError('fetchDailyTask', error);
  return data;
}

export async function startDailyTask(taskId: string) {
  const { error } = await getSupabaseClient().rpc('start_daily_task', {
    target_daily_task_id: taskId,
  });
  throwLearningError('startDailyTask', error);
}

export async function completeDailyTask(taskId: string) {
  const { error } = await getSupabaseClient().rpc('complete_daily_task', {
    target_daily_task_id: taskId,
  });
  throwLearningError('completeDailyTask', error);
}

export async function confirmDailyTasks(confirmations: ConfirmationInput[]) {
  const { error } = await getSupabaseClient().rpc('confirm_daily_tasks', {
    task_confirmations: confirmations.map((confirmation) => ({
      daily_task_id: confirmation.dailyTaskId,
      status: confirmation.status,
      actual_end_page: confirmation.actualEndPage,
    })),
  });
  throwLearningError('confirmDailyTasks', error);
}

export async function selectCollectionTheme(themeCode: string) {
  const { error } = await getSupabaseClient().rpc('select_collection_theme', {
    target_theme_code: themeCode,
  });
  throwLearningError('selectCollectionTheme', error);
}

export async function fetchCurrentCollectible(
  childId: string,
  themeCode: string | null,
): Promise<CollectibleWithCatalog | null> {
  if (!themeCode) return null;
  const { data, error } = await getSupabaseClient()
    .from('child_collectibles')
    .select('*,collectible_catalog(name)')
    .eq('child_id', childId)
    .eq('theme_code', themeCode)
    .or('status.eq.GROWING,and(status.eq.COMPLETED,revealed_at.is.null)')
    .order('sequence_no', { ascending: false })
    .limit(1)
    .maybeSingle();
  throwLearningError('fetchCurrentCollectible', error);
  return data as CollectibleWithCatalog | null;
}

export async function revealCollectible(collectibleId: string) {
  const { error } = await getSupabaseClient().rpc('reveal_collectible', {
    target_child_collectible_id: collectibleId,
  });
  throwLearningError('revealCollectible', error);
}
