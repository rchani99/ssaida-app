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

const { buildMonthlyRecords, compareMonthlyRate, endOfMonth, shiftMonth, startOfMonth } =
  module.exports;
const task = (id, date, status, extra = {}) => ({
  id,
  status,
  planned_minutes: 20,
  excluded_for_today: false,
  source_daily_task_id: null,
  daily_plans: { child_id: 'child', plan_date: date },
  ...extra,
});
const rows = [
  task('aug-done', '2026-08-01', 'PARENT_CONFIRMED'),
  task('aug-missed', '2026-08-31', 'PLANNED'),
  task('sep-done', '2026-09-01', 'CHILD_COMPLETED'),
  task('sep-partial', '2026-09-02', 'PARTIAL'),
  task('sep-retry', '2026-09-02', 'RETRY'),
  task('sep-missed', '2026-09-08', 'PLANNED'),
  task('oct-outside', '2026-10-01', 'PARENT_CONFIRMED'),
];

assert.equal(startOfMonth('2026-09-23'), '2026-09-01');
assert.equal(endOfMonth('2026-09-23'), '2026-09-30');
assert.equal(shiftMonth('2026-01-15', -1), '2025-12-01');

const monthly = buildMonthlyRecords(rows, '2026-09-01', '2026-09-30');
assert.equal(monthly.plannedCount, 4, 'month boundaries exclude August and October');
assert.equal(monthly.practicedCount, 2);
assert.equal(monthly.rate, 50);
assert.equal(monthly.plannedMinutes, 80);
assert.equal(monthly.weeks[0].rate, 67);
assert.equal(monthly.weeks[1].rate, 0);
assert.equal(monthly.weeks[4].rate, null);
assert.equal(monthly.calendar.find((day) => day.date === '2026-09-01').status, 'complete');
assert.equal(monthly.calendar.find((day) => day.date === '2026-09-02').status, 'partial');
assert.equal(monthly.calendar.find((day) => day.date === '2026-09-08').status, 'missed');
assert.equal(monthly.calendar.find((day) => day.date === '2026-09-03').status, 'none');

const comparison = compareMonthlyRate(rows, '2026-09-01', '2026-09-30');
assert.equal(comparison.previous.rate, 50);
assert.equal(comparison.difference, 0);
assert.equal(compareMonthlyRate(rows, '2026-08-01', '2026-09-30').difference, null);

const screen = readFileSync('src/features/learning/screens/records-screen.tsx', 'utf8');
assert.ok(screen.includes("{ value: 'monthly', label: '월간' }"));
assert.ok(screen.includes('onChange={setPeriodMode}'));
assert.ok(screen.includes('setSelectedMonthStart((month) => shiftMonth(month, -1))'));
assert.ok(screen.includes('next > currentMonthStart ? currentMonthStart : next'));
assert.ok(screen.includes('이번 달 기록 전체보기'));
assert.ok(screen.includes('formatMonthlyMinutes(monthly.plannedMinutes)'));
assert.ok(screen.includes('총 ${formatMonthlyMinutes(monthly.plannedMinutes)} · 선택한 달 합계'));
assert.ok(screen.includes('style={styles.monthlyComparison}'));
assert.ok(screen.includes('style={styles.monthlyComparisonUnavailable}'));
assert.ok(!screen.includes('월간 준비 중'));
assert.ok(!screen.match(/실제 수행[^\n]*\d+분/));

console.log(
  'PASS monthly records: navigation, boundaries, rate, five week buckets, calendar states and prior-month comparison',
);
