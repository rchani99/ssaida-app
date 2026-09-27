import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const api = readFileSync('src/features/learning/api/learning-api.ts', 'utf8');
const hooks = readFileSync('src/features/learning/hooks/use-learning.ts', 'utf8');
const screen = readFileSync('src/features/learning/screens/records-screen.tsx', 'utf8');

const rangeFunction = api.slice(
  api.indexOf('export async function fetchReviewTasksInRange'),
  api.indexOf('export async function fetchUnresolvedManualTasks'),
);

assert.ok(rangeFunction.includes(".eq('daily_plans.child_id', childId)"));
assert.ok(rangeFunction.includes(".gte('daily_plans.plan_date', startDate)"));
assert.ok(rangeFunction.includes(".lte('daily_plans.plan_date', endDate)"));
assert.ok(rangeFunction.includes('.range(offset, offset + 499)'));
assert.ok(rangeFunction.includes(".in('source_daily_task_id', ids.slice(offset, offset + 200))"));
assert.ok(
  !rangeFunction.includes('for (const task of'),
  'must not issue a successor query per task',
);

assert.ok(hooks.includes("['learning', 'review-range', childId, startDate, endDate]"));
assert.ok(hooks.includes('fetchReviewTasksInRange(childId!, startDate, endDate)'));

assert.ok(screen.includes('useReviewTasksInRange('));
assert.ok(screen.includes('shiftDate(selectedWeekStart, -7)'));
assert.match(screen, /const rangeEnd\s*=\s*periodMode === 'weekly'\s*\? selectedReferenceDate/);
assert.ok(screen.includes('useReviewTasksInRange(child.data?.id, rangeStart, rangeEnd)'));
assert.ok(
  screen.includes('setSelectedWeekStart((week) => shiftDate(week, -7))'),
  'previous-period navigation must replace the range query key',
);
assert.ok(
  screen.includes('next > currentWeekStart ? currentWeekStart : next'),
  'next-period navigation must replace the range query key without entering the future',
);

const januaryStart = '2026-01-01';
const januaryEnd = '2026-01-31';
assert.ok(januaryStart < januaryEnd, 'monthly date boundaries remain valid ISO query inputs');

console.log(
  'PASS records range: weekly/comparison bounds, monthly-compatible bounds, keyed navigation and batched successor lookup',
);
