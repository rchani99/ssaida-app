import { parseTime } from '@/features/notifications/types';

import type {
  DeliveryLedger,
  Notice,
  NotificationSettings,
  Snapshot,
} from '@/features/notifications/types';

export function planNotices(
  snapshot: Snapshot,
  settings: NotificationSettings,
  ledger: DeliveryLedger,
  now: number,
) {
  const { userId, childId, date, plan, tasks, pending } = snapshot;
  const target = { userId, childId, destination: 'parent' as const };
  const scheduled: Notice[] = [];
  const immediate: { notice: Notice; keys: string[] }[] = [];
  const keep = new Set<string>();
  if (!settings.notificationsEnabled) return { scheduled, immediate, keep };
  const id = (kind: string) => `ssaida:${kind}:${childId}`;
  const checkTime = parseTime(settings.parentCheckReminderTime);
  if (settings.parentCheckReminderEnabled && checkTime) {
    scheduled.push({
      id: id('parent-check'),
      title: '공부 확인할 시간이에요.',
      body: '아이의 공부 기록을 잠깐 확인해 주세요.',
      target,
      trigger: checkTime,
    });
  }
  const completeId = `${id('daily-complete')}:${date}`;
  if (
    plan?.day_type === 'STUDY' &&
    !tasks.some((task) => ['PLANNED', 'IN_PROGRESS', 'RETRY'].includes(task.status)) &&
    tasks.some((task) => task.status === 'CHILD_COMPLETED' && task.parent_verified_at === null)
  ) {
    keep.add(completeId);
    if (!ledger[completeId])
      immediate.push({
        notice: {
          id: completeId,
          title: '오늘 공부를 다 했어요.',
          body: '확인할 공부가 있어요.',
          target,
          trigger: null,
        },
        keys: [completeId],
      });
  }
  const overdue = pending.filter(
    (task) =>
      task.status === 'CHILD_COMPLETED' &&
      task.parent_verified_at === null &&
      task.child_completed_at !== null &&
      task.daily_plans.day_type === 'STUDY' &&
      Date.parse(task.child_completed_at) <= now - 3 * 86400000,
  );
  const overdueId = id('overdue-confirm');
  if (overdue.length) {
    keep.add(overdueId);
    // Per-completion receipts avoid repeating a subset when the oldest task is confirmed.
    const keys = overdue
      .map((task) => `overdue:${childId}:${task.id}:${task.child_completed_at}`)
      .filter((key) => !ledger[key]);
    if (keys.length)
      immediate.push({
        notice: {
          id: overdueId,
          title: '확인할 공부가 조금 쌓였어요.',
          body: '아이의 공부 기록을 잠깐 확인해 주세요.',
          target,
          trigger: null,
        },
        keys,
      });
  }
  const unfinishedTime = parseTime(settings.unfinishedReminderTime);
  if (
    settings.unfinishedReminderEnabled &&
    unfinishedTime &&
    plan?.day_type === 'STUDY' &&
    tasks.some((task) => ['PLANNED', 'IN_PROGRESS'].includes(task.status))
  ) {
    const at = new Date(`${date}T00:00:00`);
    at.setHours(unfinishedTime.hour, unfinishedTime.minute, 0, 0);
    const unfinishedId = `${id('unfinished')}:${date}`;
    keep.add(unfinishedId);
    // Never replay a missed/delivered clock reminder upon resume later that day.
    if (at.getTime() > now)
      scheduled.push({
        id: unfinishedId,
        title: '오늘 할 공부가 아직 남아 있어요.',
        body: '오늘 계획을 편하게 살펴봐 주세요.',
        target: { ...target, destination: 'child' },
        trigger: { at: at.getTime() },
      });
  }
  scheduled.forEach((notice) => keep.add(notice.id));
  return { scheduled, immediate, keep };
}

export function tapDestination(
  target: { userId: string; childId: string; destination: string },
  userId: string,
  childId: string,
  mode: string,
) {
  if (target.userId !== userId || target.childId !== childId) return null;
  if (target.destination === 'child') return 'child';
  if (target.destination === 'parent') return mode === 'parent' ? 'parent' : 'pin';
  return null;
}
