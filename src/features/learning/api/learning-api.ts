import { isOneTime, unresolvedManualTasks } from '@/features/learning/utils/exception-tasks';
import { getSupabaseClient } from '@/lib/supabase/client';

import type {
  CollectibleWithCatalog,
  ConfirmationInput,
  CreateStudyItemInput,
  DailyPlan,
  DailyTask,
  DailyTaskWithPlan,
  ManualTaskInput,
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
  return excludeRescheduledSources(data);
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
  return excludeRescheduledSources(data as DailyTaskWithPlan[]);
}

export async function fetchPendingConfirmations(childId: string): Promise<DailyTaskWithPlan[]> {
  const { data, error } = await getSupabaseClient()
    .from('daily_tasks')
    .select('*,daily_plans!inner(child_id,plan_date)')
    .eq('daily_plans.child_id', childId)
    .eq('status', 'CHILD_COMPLETED')
    .is('parent_verified_at', null)
    .order('child_completed_at');
  throwLearningError('fetchPendingConfirmations', error);
  return data as DailyTaskWithPlan[];
}

// A successor can already be finalized or on another date; never filter it by status/date.
async function excludeRescheduledSources<T extends DailyTask>(tasks: T[]): Promise<T[]> {
  const ids = tasks.filter(isOneTime).map((task) => task.id);
  const superseded = new Set<string>();
  for (let offset = 0; offset < ids.length; offset += 200) {
    const { data, error } = await getSupabaseClient()
      .from('daily_tasks')
      .select('source_daily_task_id')
      .in('source_daily_task_id', ids.slice(offset, offset + 200));
    throwLearningError('rescheduleSuccessors', error);
    data.forEach((row) => {
      if (row.source_daily_task_id) superseded.add(row.source_daily_task_id);
    });
  }
  return tasks.filter((task) => !superseded.has(task.id));
}

export async function fetchReviewTasks(childId: string): Promise<DailyTaskWithPlan[]> {
  const result: DailyTaskWithPlan[] = [];
  // Paginate history so an older chain ancestor cannot reappear due to the API row limit.
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await getSupabaseClient()
      .from('daily_tasks')
      .select('*,daily_plans!inner(child_id,plan_date)')
      .eq('daily_plans.child_id', childId)
      .order('id')
      .range(offset, offset + 499);
    throwLearningError('fetchReviewTasks', error);
    result.push(...(data as DailyTaskWithPlan[]));
    if (data.length < 500) return result;
  }
}

export async function fetchUnresolvedManualTasks(childId: string, today: string) {
  return unresolvedManualTasks(await fetchReviewTasks(childId), today);
}

export async function addManualDailyTask(input: ManualTaskInput) {
  // Generated RPC Args cannot express nullable SQL input parameters. Narrow the cast
  // here only; SQL requires NULL pages for ACTIVITY and allows NULL subject.
  const args = {
    target_child_id: input.childId,
    target_plan_date: input.planDate,
    manual_item_type: input.itemType,
    manual_name: input.name.trim(),
    manual_subject: input.subject,
    manual_planned_start_page: input.startPage,
    manual_planned_end_page: input.endPage,
    manual_planned_minutes: input.minutes,
  };
  const { data, error } = await getSupabaseClient().rpc(
    'add_manual_daily_task',
    args as import('@/lib/supabase/database.types').Database['public']['Functions']['add_manual_daily_task']['Args'],
  );
  throwLearningError('addManualDailyTask', error);
  return data;
}

export async function rescheduleManualTask(input: { taskId: string; date: string }) {
  const { data, error } = await getSupabaseClient().rpc('reschedule_manual_task', {
    source_daily_task_id: input.taskId,
    target_plan_date: input.date,
  });
  if (
    error?.code === '22023' &&
    error.message === 'This task has already been rescheduled to another date'
  ) {
    throw new Error('이미 다른 날짜로 옮긴 공부예요.');
  }
  if (error) {
    if (__DEV__) console.error('[learning] rescheduleManualTask', error);
    throw new Error('공부를 옮기지 못했어요. 목록을 다시 확인해 주세요.');
  }
  return data;
}

export async function skipManualTask(taskId: string) {
  const { error } = await getSupabaseClient().rpc('skip_manual_task', {
    target_daily_task_id: taskId,
  });
  throwLearningError('skipManualTask', error);
}

export async function fetchDailyTask(taskId: string) {
  const { data, error } = await getSupabaseClient()
    .from('daily_tasks')
    .select('*')
    .eq('id', taskId)
    .single();
  throwLearningError('fetchDailyTask', error);
  const visible = await excludeRescheduledSources([data]);
  return { ...data, isSuperseded: visible.length === 0 };
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
