import { groupTodayTasks } from '@/features/learning/utils/visible-tasks';

import type { DailyTask } from '@/features/learning/types/learning.types';

// Only a successful completion in this screen can trigger the celebration.
// Excluded, blocked and superseded tasks follow the dashboard's counting rules.
export function completionReward(tasks: DailyTask[], completedTaskId: string) {
  const group = groupTodayTasks(tasks, []);
  const active = group.today.filter((task) => !task.quantity_conflict);
  if (
    !active.some((task) => task.id === completedTaskId && task.status === 'CHILD_COMPLETED') ||
    group.remaining !== 0 ||
    group.completed !== group.todayCount
  )
    return null;

  // This is an upper bound, not awarded growth. PARTIAL/RETRY and overlapping
  // progress can reduce the eventual reward; pending points have no per-day ledger.
  return {
    potentialPoints: Number(
      active
        .filter((task) => task.status === 'CHILD_COMPLETED')
        .reduce((sum, task) => sum + task.growth_weight, 0)
        .toFixed(6),
    ),
  };
}

export function growthStage(points: number, goal: number, ready: boolean) {
  const percent = goal > 0 ? Math.max(0, Math.min(100, (points / goal) * 100)) : 0;
  return {
    percent: Math.floor(percent),
    stage: ready ? 4 : Math.min(3, Math.floor(percent / 25)),
    label: ready
      ? '완성! 공개해보세요'
      : ['작은 빛이 생겼어요', '조금씩 자라고 있어요', '제법 자랐어요', '곧 만날 수 있어요'][
          Math.min(3, Math.floor(percent / 25))
        ],
  };
}
