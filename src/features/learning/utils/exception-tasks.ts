import type {
  ConfirmationInput,
  DailyTask,
  DailyTaskWithPlan,
  StudyItem,
} from '@/features/learning/types/learning.types';

export type ConfirmationDraft = {
  selected?: boolean;
  status?: ConfirmationInput['status'];
  page?: string;
};

export function buildConfirmations(
  tasks: DailyTask[],
  drafts: Record<string, ConfirmationDraft>,
  items: StudyItem[],
): ConfirmationInput[] {
  const selected = tasks.filter((task) => drafts[task.id]?.selected !== false);
  if (!selected.length) throw new Error('확인할 공부를 선택해 주세요.');
  return selected.map((task) => {
    const draft = drafts[task.id];
    const status = draft?.status ?? 'PARENT_CONFIRMED';
    if (status === 'RETRY') return { dailyTaskId: task.id, status, actualEndPage: null };
    if (task.item_type === 'ACTIVITY') {
      if (status === 'PARTIAL') throw new Error('활동은 완료 또는 다시 하기를 선택해 주세요.');
      return { dailyTaskId: task.id, status, actualEndPage: null };
    }
    const value = draft?.page ?? (status === 'PARTIAL' ? '' : String(task.planned_end_page));
    const page = Number(value);
    if (!/^\d+$/.test(value) || !Number.isSafeInteger(page) || page > 2147483647) {
      throw new Error('실제로 완료한 마지막 쪽을 입력해 주세요.');
    }
    if (
      status === 'PARTIAL' &&
      (page < (task.planned_start_page ?? 1) || page >= (task.planned_end_page ?? 1))
    ) {
      throw new Error('조금만 했어요는 시작 쪽부터 계획 마지막 쪽 전까지만 입력해 주세요.');
    }
    if (status === 'PARENT_CONFIRMED' && page < (task.planned_end_page ?? 1)) {
      throw new Error('계획보다 적게 했다면 조금만 했어요를 선택해 주세요.');
    }
    if (task.study_item_id !== null) {
      const item = items.find((item) => item.id === task.study_item_id);
      if (!item || item.workbook_last_page === null)
        throw new Error('문제집 정보를 불러온 뒤 다시 확인해 주세요.');
      if (page > item.workbook_last_page) throw new Error('마지막 쪽을 넘을 수 없어요.');
    }
    return { dailyTaskId: task.id, status, actualEndPage: page };
  });
}

export function isOneTime(task: Pick<DailyTask, 'source_type'>) {
  return task.source_type === 'MANUAL' || task.source_type === 'RESCHEDULED';
}

export function unresolvedManualTasks(tasks: DailyTaskWithPlan[], today: string) {
  const superseded = new Set(tasks.map((task) => task.source_daily_task_id).filter(Boolean));
  return tasks.filter(
    (task) =>
      isOneTime(task) &&
      task.daily_plans.plan_date < today &&
      ['PLANNED', 'IN_PROGRESS', 'RETRY'].includes(task.status) &&
      !superseded.has(task.id),
  );
}

// Only a previously confirmed PARTIAL followed by a preserved started task is a warning.
// Normal planning-only provisional progress alone must not produce this warning.
export function progressConflicts(tasks: DailyTaskWithPlan[], items: StudyItem[]) {
  return tasks.filter((task) => {
    if (
      task.source_type !== 'AUTO' ||
      task.item_type !== 'WORKBOOK' ||
      !task.study_item_id ||
      !['IN_PROGRESS', 'CHILD_COMPLETED'].includes(task.status)
    )
      return false;
    const item = items.find((item) => item.id === task.study_item_id);
    if (
      item?.workbook_last_completed_page == null ||
      task.planned_start_page == null ||
      task.planned_start_page <= item.workbook_last_completed_page + 1
    )
      return false;
    return tasks.some(
      (earlier) =>
        earlier.study_item_id === task.study_item_id &&
        earlier.status === 'PARTIAL' &&
        earlier.daily_plans.plan_date < task.daily_plans.plan_date &&
        earlier.parent_verified_at !== null &&
        task.started_at !== null &&
        Date.parse(earlier.parent_verified_at) >= Date.parse(task.started_at),
    );
  });
}

export function needsParentReminder(task: DailyTask, now = Date.now()) {
  return (
    task.status === 'CHILD_COMPLETED' &&
    task.parent_verified_at === null &&
    task.child_completed_at !== null &&
    Date.parse(task.child_completed_at) <= now - 3 * 86400000
  );
}

export function prioritizeTodayTasks<T extends Pick<DailyTask, 'status'>>(tasks: T[]): T[] {
  const rank: Record<string, number> = { IN_PROGRESS: 0, RETRY: 1, PLANNED: 2, CHILD_COMPLETED: 3 };
  return tasks
    .filter((task) => task.status !== 'SKIPPED')
    .sort((a, b) => (rank[a.status] ?? 4) - (rank[b.status] ?? 4));
}
