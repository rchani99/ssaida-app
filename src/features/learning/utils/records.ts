import type { DailyTaskWithPlan } from '@/features/learning/types/learning.types';

export type RecordsDay = {
  date: string;
  planned: number;
  practiced: number;
  isRest: boolean;
  rate: number | null;
};

export type MonthlyCalendarDay = RecordsDay & {
  status: 'complete' | 'partial' | 'missed' | 'none';
};

// Keep the dashboard's existing completion rule: a child completion is practiced,
// while its parent-verification state remains visible separately in history.
const PRACTICED_STATUSES = new Set(['CHILD_COMPLETED', 'PARENT_CONFIRMED', 'PARTIAL']);

export function startOfWeek(date: string) {
  const value = new Date(`${date}T12:00:00+09:00`);
  const day = value.getUTCDay() || 7;
  value.setUTCDate(value.getUTCDate() - day + 1);
  return value.toISOString().slice(0, 10);
}

export function shiftDate(date: string, days: number) {
  const value = new Date(`${date}T12:00:00+09:00`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function startOfMonth(date: string) {
  return `${date.slice(0, 7)}-01`;
}

export function endOfMonth(date: string) {
  const value = new Date(`${startOfMonth(date)}T12:00:00+09:00`);
  value.setUTCMonth(value.getUTCMonth() + 1);
  value.setUTCDate(0);
  return value.toISOString().slice(0, 10);
}

export function shiftMonth(date: string, months: number) {
  const value = new Date(`${startOfMonth(date)}T12:00:00+09:00`);
  value.setUTCMonth(value.getUTCMonth() + months);
  return value.toISOString().slice(0, 10);
}

export function compareWeeklyRate(tasks: DailyTaskWithPlan[], today: string) {
  const current = buildWeeklyRecords(tasks, today);
  const previous = buildWeeklyRecords(tasks, shiftDate(today, -7));
  return {
    current,
    previous,
    difference:
      current.rate === null || previous.rate === null ? null : current.rate - previous.rate,
  };
}

export function buildWeeklyRecords(tasks: DailyTaskWithPlan[], today: string) {
  const weekStart = startOfWeek(today);
  const superseded = new Set(
    tasks.map((task) => task.source_daily_task_id).filter((id): id is string => Boolean(id)),
  );
  tasks.filter((task) => task.is_superseded).forEach((task) => superseded.add(task.id));
  const eligible = tasks.filter(
    (task) =>
      task.daily_plans.plan_date >= weekStart &&
      task.daily_plans.plan_date <= today &&
      !task.excluded_for_today &&
      task.status !== 'SKIPPED' &&
      !superseded.has(task.id),
  );
  const practiced = eligible.filter((task) => PRACTICED_STATUSES.has(task.status));
  const days: RecordsDay[] = Array.from({ length: 7 }, (_, offset) => {
    const date = new Date(`${weekStart}T12:00:00+09:00`);
    date.setUTCDate(date.getUTCDate() + offset);
    const key = date.toISOString().slice(0, 10);
    const dayTasks = eligible.filter((task) => task.daily_plans.plan_date === key);
    return {
      date: key,
      planned: dayTasks.length,
      practiced: dayTasks.filter((task) => PRACTICED_STATUSES.has(task.status)).length,
      isRest: dayTasks.length === 0,
      rate: dayTasks.length
        ? Math.round(
            (dayTasks.filter((task) => PRACTICED_STATUSES.has(task.status)).length /
              dayTasks.length) *
              100,
          )
        : null,
    };
  });
  return {
    weekStart,
    weekEnd: days[6].date,
    plannedCount: eligible.length,
    practicedCount: practiced.length,
    plannedMinutes: eligible.reduce((sum, task) => sum + task.planned_minutes, 0),
    rate: eligible.length ? Math.round((practiced.length / eligible.length) * 100) : null,
    days,
  };
}

export function compareMonthlyRate(
  tasks: DailyTaskWithPlan[],
  selectedMonth: string,
  today: string,
) {
  const current = buildMonthlyRecords(tasks, selectedMonth, today);
  const previousMonth = shiftMonth(selectedMonth, -1);
  const previous = buildMonthlyRecords(tasks, previousMonth, endOfMonth(previousMonth));
  return {
    current,
    previous,
    difference:
      current.rate === null || previous.rate === null ? null : current.rate - previous.rate,
  };
}

export function buildMonthlyRecords(
  tasks: DailyTaskWithPlan[],
  selectedMonth: string,
  today: string,
) {
  const monthStart = startOfMonth(selectedMonth);
  const monthEnd = endOfMonth(monthStart);
  const effectiveEnd = monthStart === startOfMonth(today) ? today : monthEnd;
  const superseded = new Set(
    tasks.map((task) => task.source_daily_task_id).filter((id): id is string => Boolean(id)),
  );
  tasks.filter((task) => task.is_superseded).forEach((task) => superseded.add(task.id));
  const eligible = tasks.filter(
    (task) =>
      task.daily_plans.plan_date >= monthStart &&
      task.daily_plans.plan_date <= effectiveEnd &&
      !task.excluded_for_today &&
      task.status !== 'SKIPPED' &&
      !superseded.has(task.id),
  );
  const practiced = eligible.filter((task) => PRACTICED_STATUSES.has(task.status));
  const calendar: MonthlyCalendarDay[] = [];
  for (let date = monthStart; date <= monthEnd; date = shiftDate(date, 1)) {
    const dayTasks = eligible.filter((task) => task.daily_plans.plan_date === date);
    const dayPracticed = dayTasks.filter((task) => PRACTICED_STATUSES.has(task.status)).length;
    calendar.push({
      date,
      planned: dayTasks.length,
      practiced: dayPracticed,
      isRest: dayTasks.length === 0,
      rate: dayTasks.length ? Math.round((dayPracticed / dayTasks.length) * 100) : null,
      status:
        dayTasks.length === 0
          ? 'none'
          : dayPracticed === dayTasks.length
            ? 'complete'
            : dayPracticed > 0
              ? 'partial'
              : 'missed',
    });
  }
  const weeks = Array.from({ length: 5 }, (_, index) => {
    const days = calendar.slice(index * 7, (index + 1) * 7);
    const planned = days.reduce((sum, day) => sum + day.planned, 0);
    const completed = days.reduce((sum, day) => sum + day.practiced, 0);
    return {
      label: `${index + 1}주차`,
      planned,
      practiced: completed,
      rate: planned ? Math.round((completed / planned) * 100) : null,
    };
  });
  return {
    monthStart,
    monthEnd,
    plannedCount: eligible.length,
    practicedCount: practiced.length,
    plannedMinutes: eligible.reduce((sum, task) => sum + task.planned_minutes, 0),
    rate: eligible.length ? Math.round((practiced.length / eligible.length) * 100) : null,
    weeks,
    calendar,
  };
}

export function historyStatus(
  task: DailyTaskWithPlan,
  superseded: ReadonlySet<string>,
): { label: string; tone: 'success' | 'pending' | 'unfinished' | 'neutral' } {
  if (task.excluded_for_today) return { label: '계획에서 제외', tone: 'neutral' };
  if (superseded.has(task.id)) return { label: '다른 날로 이동', tone: 'neutral' };
  if (task.status === 'PARENT_CONFIRMED') return { label: '완료', tone: 'success' };
  if (task.status === 'PARTIAL') return { label: '일부 실천', tone: 'unfinished' };
  if (task.status === 'CHILD_COMPLETED') return { label: '확인 대기', tone: 'pending' };
  if (task.status === 'RETRY') return { label: '다시 하기', tone: 'unfinished' };
  if (task.status === 'SKIPPED') return { label: '건너뜀', tone: 'neutral' };
  if (task.status === 'IN_PROGRESS') return { label: '진행 중', tone: 'unfinished' };
  return { label: '미실천', tone: 'neutral' };
}

export function taskRange(task: DailyTaskWithPlan) {
  if (task.item_type !== 'WORKBOOK') return `계획 ${task.planned_minutes}분`;
  if (task.planned_start_page == null || task.planned_end_page == null) return '범위 정보 없음';
  const planned = `${task.planned_start_page}–${task.planned_end_page}쪽`;
  if (task.actual_end_page == null) return planned;
  return `${planned} · ${task.actual_end_page}쪽까지`;
}

export function groupHistory(tasks: DailyTaskWithPlan[], today: string) {
  const past = tasks
    .filter((task) => task.daily_plans.plan_date < today)
    .sort(
      (a, b) =>
        b.daily_plans.plan_date.localeCompare(a.daily_plans.plan_date) ||
        a.sort_order - b.sort_order,
    );
  const groups = new Map<string, DailyTaskWithPlan[]>();
  past.forEach((task) => {
    const date = task.daily_plans.plan_date;
    groups.set(date, [...(groups.get(date) ?? []), task]);
  });
  return [...groups.entries()].map(([date, dateTasks]) => ({ date, tasks: dateTasks }));
}

export function groupHistoryForWeek(
  tasks: DailyTaskWithPlan[],
  weekStart: string,
  weekEnd: string,
) {
  return groupHistory(tasks, shiftDate(weekEnd, 1)).filter(
    ({ date }) => date >= weekStart && date <= weekEnd,
  );
}

export function parentCheckLabel(task: DailyTaskWithPlan) {
  if (task.parent_verified_at) return '부모 확인 완료';
  if (task.status === 'CHILD_COMPLETED') return '부모 확인 전';
  return '확인 대상 아님';
}
