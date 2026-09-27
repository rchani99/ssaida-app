import type { DailyTask } from '@/features/learning/types/learning.types';

// Queries already remove rescheduled ancestors across all dates. Also reconcile
// both snapshots here so an old continuing cache cannot duplicate today's child.
export function groupTodayTasks(today: DailyTask[], past: DailyTask[]) {
  const successors = new Set(
    [...today, ...past].map((task) => task.source_daily_task_id).filter(Boolean),
  );
  const visible = (task: DailyTask) =>
    !task.excluded_for_today && task.status !== 'SKIPPED' && !successors.has(task.id);
  const todayRows = today.filter(visible);
  const todayIds = new Set(todayRows.map((task) => task.id));
  const continuing = past.filter(
    (task) =>
      visible(task) &&
      !todayIds.has(task.id) &&
      !task.quantity_conflict &&
      ['IN_PROGRESS', 'RETRY'].includes(task.status),
  );
  const countedToday = todayRows.filter((task) => !task.quantity_conflict);
  return {
    today: todayRows,
    continuing,
    todayCount: countedToday.length,
    todayMinutes: countedToday.reduce((sum, task) => sum + task.planned_minutes, 0),
    continuingMinutes: continuing.reduce((sum, task) => sum + task.planned_minutes, 0),
    completed: countedToday.filter((task) =>
      ['CHILD_COMPLETED', 'PARENT_CONFIRMED', 'PARTIAL'].includes(task.status),
    ).length,
    remaining:
      continuing.length +
      countedToday.filter((task) => ['PLANNED', 'IN_PROGRESS', 'RETRY'].includes(task.status))
        .length,
  };
}

export function mergeVisibleTasks<Task extends { study_item_id: string | null }>(
  continuing: Task[],
  today: Task[],
): Task[] {
  const continuingItemIds = new Set(
    continuing.map((task) => task.study_item_id).filter((id) => id !== null),
  );
  return [
    ...continuing,
    ...today.filter(
      (task) => task.study_item_id === null || !continuingItemIds.has(task.study_item_id),
    ),
  ];
}
