import { prioritizeTodayTasks } from '@/features/learning/utils/exception-tasks';
import { groupTodayTasks } from '@/features/learning/utils/visible-tasks';

import type { DailyTask } from '@/features/learning/types/learning.types';

export function nextStudyTask(today: DailyTask[], continuing: DailyTask[], completedId: string) {
  const groups = groupTodayTasks(prioritizeTodayTasks(today), continuing);
  return [...groups.continuing, ...groups.today].find(
    (task) =>
      task.id !== completedId &&
      !task.quantity_conflict &&
      ['PLANNED', 'IN_PROGRESS', 'RETRY'].includes(task.status),
  );
}
