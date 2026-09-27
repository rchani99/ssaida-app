import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import ts from 'typescript';

const source = readFileSync('src/features/learning/utils/records.ts', 'utf8');
const module = { exports: {} };
new Function(
  'require',
  'module',
  'exports',
  ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
)(
  (id) => {
    throw new Error(`Unexpected import: ${id}`);
  },
  module,
  module.exports,
);

const {
  buildWeeklyRecords,
  compareWeeklyRate,
  groupHistory,
  groupHistoryForWeek,
  historyStatus,
  parentCheckLabel,
  taskRange,
} = module.exports;
const task = (id, date, status, extra = {}) => ({
  id,
  status,
  item_type: 'ACTIVITY',
  planned_minutes: 20,
  excluded_for_today: false,
  parent_verified_at: null,
  actual_end_page: null,
  planned_start_page: null,
  planned_end_page: null,
  source_daily_task_id: null,
  sort_order: 0,
  daily_plans: { child_id: 'child', plan_date: date },
  ...extra,
});

const rows = [
  task('done', '2026-09-21', 'PARENT_CONFIRMED', { parent_verified_at: '2026-09-21T12:00:00Z' }),
  task('partial', '2026-09-22', 'PARTIAL'),
  task('retry', '2026-09-22', 'RETRY'),
  task('waiting', '2026-09-23', 'CHILD_COMPLETED'),
  task('excluded', '2026-09-23', 'PLANNED', { excluded_for_today: true, planned_minutes: 100 }),
  task('skipped', '2026-09-23', 'SKIPPED'),
  task('source', '2026-09-21', 'PLANNED'),
  task('moved', '2026-09-23', 'PLANNED', {
    source_type: 'RESCHEDULED',
    source_daily_task_id: 'source',
  }),
  task('future', '2026-09-24', 'PARENT_CONFIRMED'),
  task('old', '2026-09-20', 'PARENT_CONFIRMED'),
  task('last-mon-done', '2026-09-14', 'PARENT_CONFIRMED'),
  task('last-tue-missed', '2026-09-15', 'PLANNED'),
  task('last-wed-missed', '2026-09-16', 'RETRY'),
];

const weekly = buildWeeklyRecords(rows, '2026-09-23');
assert.equal(weekly.weekStart, '2026-09-21');
assert.equal(weekly.weekEnd, '2026-09-27');
assert.equal(weekly.plannedCount, 5, 'exclude skipped/excluded/superseded/future');
assert.equal(weekly.practicedCount, 3, 'match existing completed-status grouping');
assert.equal(weekly.rate, 60);
assert.equal(weekly.plannedMinutes, 100, 'planned time is shown, not invented actual time');
assert.deepEqual(
  weekly.days.slice(0, 3).map(({ practiced, planned }) => [practiced, planned]),
  [
    [1, 1],
    [1, 2],
    [1, 2],
  ],
);
assert.deepEqual(
  weekly.days.slice(0, 3).map(({ rate }) => rate),
  [100, 50, 50],
  'weekday bars use practiced/planned ratios',
);
const comparison = compareWeeklyRate(rows, '2026-09-23');
assert.equal(
  comparison.previous.rate,
  33,
  'previous period uses the same Monday-to-Wednesday range',
);
assert.equal(comparison.difference, 27);
assert.equal(
  compareWeeklyRate(rows, '2026-09-13').difference,
  null,
  'no fake comparison without plans',
);
const previousSelection = compareWeeklyRate(rows, '2026-09-16').current;
assert.equal(previousSelection.weekStart, '2026-09-14');
assert.equal(previousSelection.rate, 33, 'moving back refreshes selected-week practice rate');
assert.deepEqual(
  previousSelection.days.slice(0, 3).map(({ rate }) => rate),
  [100, 0, 0],
  'moving back refreshes weekday ratios',
);
assert.equal(groupHistoryForWeek(rows, '2026-09-14', '2026-09-20')[0].date, '2026-09-20');

assert.equal(groupHistory(rows, '2026-09-23')[0].date, '2026-09-22');
const superseded = new Set(['source']);
assert.equal(historyStatus(rows[6], superseded).label, '다른 날로 이동');
assert.equal(historyStatus(rows[4], superseded).label, '계획에서 제외');
assert.equal(parentCheckLabel(rows[0]), '부모 확인 완료');
assert.equal(parentCheckLabel(rows[3]), '부모 확인 전');
assert.equal(
  taskRange(
    task('book', '2026-09-22', 'PARTIAL', {
      item_type: 'WORKBOOK',
      planned_start_page: 10,
      planned_end_page: 15,
      actual_end_page: 12,
    }),
  ),
  '10–15쪽 · 12쪽까지',
);

const screen = readFileSync('src/features/learning/screens/records-screen.tsx', 'utf8');
assert.ok(screen.includes("{ value: 'monthly', label: '월간' }"));
assert.ok(screen.includes('실제 수행 시간은 현재 기록되지 않아요'));
assert.ok(!screen.match(/실제 수행[^\n]*\d+분/));
assert.ok(
  screen.includes(
    'groupHistoryForWeek(tasks, summary.weekStart, selectedReferenceDate).slice(0, 1)',
  ),
);
assert.ok(screen.includes("router.push('/parent-records')"));
assert.ok(!screen.includes('disabledPattern'));
assert.ok(screen.includes('setSelectedWeekStart((week) => shiftDate(week, -7))'));
assert.ok(screen.includes('next > currentWeekStart ? currentWeekStart : next'));
assert.ok(screen.includes("disabled={periodMode === 'weekly' ? isCurrentWeek : isCurrentMonth}"));
assert.ok(screen.includes('{summary.plannedCount}개 중 {summary.practicedCount}개 완료'));
assert.ok(!screen.includes('완료 상태 기준'));
assert.ok(screen.includes("statsRow: { flexDirection: 'row'"));
const historyScreen = readFileSync(
  'src/features/learning/screens/records-history-screen.tsx',
  'utf8',
);
assert.ok(historyScreen.includes('groupHistory(tasks, today)'));
assert.ok(historyScreen.includes('RecordsHistoryList'));
console.log(
  'PASS records: ring source, weekday ratios, comparable prior period, recent-only preview, full-history route and no fake actual time',
);
