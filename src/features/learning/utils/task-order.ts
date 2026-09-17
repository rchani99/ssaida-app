import type { DailyTask } from '@/features/learning/types/learning.types';

export function seoulDate(now = new Date()) {
  return new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function editableTasks(tasks: DailyTask[]) {
  return tasks
    .filter(
      (task) => !task.excluded_for_today && task.status === 'PLANNED' && task.started_at === null,
    )
    .sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id));
}

export function moveTask<T>(tasks: T[], index: number, direction: -1 | 1): T[] {
  const next = index + direction;
  if (index < 0 || index >= tasks.length || next < 0 || next >= tasks.length) return tasks;
  const result = [...tasks];
  [result[index], result[next]] = [result[next], result[index]];
  return result;
}

export function orderSnapshot(tasks: DailyTask[]) {
  return tasks
    .map((task) => `${task.id}:${task.updated_at}:${task.sort_order}`)
    .sort()
    .join('|');
}
