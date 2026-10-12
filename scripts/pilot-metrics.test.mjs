import assert from 'node:assert/strict';
import test from 'node:test';

import { summarizePilot } from './pilot-metrics.mjs';
const family = { family_id: 'f1', signed_up_at: '2026-10-04T15:00:00Z' };
const event = (id, time, status = 'PARENT_CONFIRMED') => ({
  family_id: 'f1',
  daily_task_id: id,
  child_completed_at: time,
  parent_verified_at: time,
  verification_status: status,
});
test('Korean calendar weeks, two days, duplicate and future exclusions', () => {
  const rows = [
    event('a', '2026-10-06T10:00:00Z'),
    event('b', '2026-10-11T15:01:00Z'),
    event('b', '2026-10-11T15:01:00Z'),
    event('c', '2026-10-12T15:01:00Z'),
    event('d', '2026-11-01T00:00:00Z'),
  ];
  const [r] = summarizePilot({ families: [family], cycles: rows }, '2026-10-18T15:00:00Z');
  assert.equal(r.activated, true);
  assert.equal(r.cycle_count, 3);
  assert.equal(r.retention_days, 2);
  assert.equal(r.retained, true);
  assert.equal(r.retention_window_end, '2026-10-18T15:00:00.000Z');
});
test('unmatured cohorts never enter the retention denominator', () => {
  const [r] = summarizePilot(
    { families: [family], cycles: [event('a', '2026-10-06T10:00:00Z')] },
    '2026-10-15T00:00:00Z',
  );
  assert.equal(r.retention_observed, false);
  assert.equal(r.retained, null);
});
test('activation excludes exactly seven days, skipped and impossible sequences', () => {
  const bad = {
    ...event('bad', '2026-10-05T10:00:00Z'),
    child_completed_at: '2026-10-05T11:00:00Z',
  };
  const [r] = summarizePilot(
    {
      families: [family],
      cycles: [
        bad,
        event('skip', '2026-10-06T10:00:00Z', 'SKIPPED'),
        event('a', '2026-10-11T15:00:00Z'),
      ],
    },
    '2026-10-30T00:00:00Z',
  );
  assert.equal(r.activated, false);
  assert.equal(r.cycle_count, 1);
});
test('parent review RETRY is a completed management cycle, not evidence of learning', () => {
  const [r] = summarizePilot(
    { families: [family], cycles: [event('a', '2026-10-06T10:00:00Z', 'RETRY')] },
    '2026-10-30T00:00:00Z',
  );
  assert.equal(r.activated, true);
  assert.equal(r.retention_days, 0);
});
test('duplicate cohort rows rejected and empty data valid', () => {
  assert.throws(
    () => summarizePilot({ families: [family, family], cycles: [] }, '2026-10-09T00:00:00Z'),
    /Duplicate/,
  );
  assert.deepEqual(summarizePilot({ families: [], cycles: [] }, '2026-10-09T00:00:00Z'), []);
});
