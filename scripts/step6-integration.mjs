// Local DB -> production snapshot query -> notification planner (no OS delivery).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createClient } from '@supabase/supabase-js';
import ts from 'typescript';

const url = process.env.STEP3_API_URL;
assert.ok(url && ['127.0.0.1', 'localhost'].includes(new URL(url).hostname), 'Local Supabase only');
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, process.env.STEP3_SERVICE_ROLE_KEY, options);
const client = createClient(url, process.env.STEP3_ANON_KEY, options);
function load(path, imports = {}) {
  const code = ts.transpileModule(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', '__DEV__', code)(
    (id) => {
      assert.ok(id in imports, id);
      return imports[id];
    },
    module,
    module.exports,
    false,
  );
  return module.exports;
}
const rules = load('src/features/learning/utils/exception-tasks.ts');
const api = load('src/features/learning/api/learning-api.ts', {
  '@/features/learning/utils/exception-tasks': rules,
  '@/lib/supabase/client': { getSupabaseClient: () => client },
});
const { fetchNotificationSnapshot } = load('src/features/notifications/api.ts', {
  '@/features/learning/api/learning-api': api,
  '@/lib/supabase/client': { getSupabaseClient: () => client },
});
const types = load('src/features/notifications/types.ts');
const { planNotices } = load('src/features/notifications/planner.ts', {
  '@/features/notifications/types': types,
});
async function checked(promise) {
  const result = await promise;
  assert.equal(result.error, null, result.error?.message);
  return result.data;
}
const email = `step6-${crypto.randomUUID()}@example.test`;
const password = crypto.randomUUID();
const { user } = await checked(
  admin.auth.admin.createUser({ email, password, email_confirm: true }),
);
try {
  await checked(client.auth.signInWithPassword({ email, password }));
  await checked(
    client.rpc('complete_parent_onboarding', {
      child_name: 'Step6 fixture',
      parent_pin: '1234',
      target_minutes: 60,
    }),
  );
  const child = await api.fetchCurrentChild();
  const date = '2026-09-10';
  const manual = async (name, targetDate = date) =>
    api.addManualDailyTask({
      childId: child.id,
      planDate: targetDate,
      name,
      itemType: 'ACTIVITY',
      subject: null,
      minutes: 20,
      startPage: null,
      endPage: null,
    });
  const a = await manual('one');
  const b = await manual('two');
  const complete = async (id) => {
    await api.startDailyTask(id);
    await api.completeDailyTask(id);
  };
  const prefs = { ...types.defaultSettings, notificationsEnabled: true };
  await complete(a);
  let snapshot = await fetchNotificationSnapshot(user.id, date);
  assert.equal(planNotices(snapshot, prefs, {}, Date.now()).immediate.length, 0);
  await complete(b);
  snapshot = await fetchNotificationSnapshot(user.id, date);
  assert.equal(planNotices(snapshot, prefs, {}, Date.now()).immediate.length, 1);
  await checked(
    admin
      .from('daily_tasks')
      .update({ child_completed_at: new Date(Date.now() - 4 * 86400000).toISOString() })
      .in('id', [a, b]),
  );
  await checked(
    admin
      .from('children')
      .update({ rest_weekdays: [7] })
      .eq('id', child.id),
  );
  const rest = await manual('rest', '2026-09-13');
  await complete(rest);
  await checked(
    admin
      .from('daily_tasks')
      .update({ child_completed_at: new Date(Date.now() - 4 * 86400000).toISOString() })
      .eq('id', rest),
  );
  snapshot = await fetchNotificationSnapshot(user.id, date);
  assert.equal(snapshot.pending.length, 2);
  assert.ok(snapshot.pending.every((t) => t.daily_plans.day_type === 'STUDY'));
  const notices = planNotices(snapshot, prefs, {}, Date.now());
  assert.ok(notices.immediate.some((entry) => entry.notice.id.includes('overdue-confirm')));
  await api.confirmDailyTasks([
    { dailyTaskId: a, status: 'RETRY', actualEndPage: null },
    { dailyTaskId: b, status: 'PARENT_CONFIRMED', actualEndPage: null },
  ]);
  snapshot = await fetchNotificationSnapshot(user.id, date);
  assert.equal(snapshot.pending.length, 0);
  assert.equal(planNotices(snapshot, prefs, {}, Date.now()).immediate.length, 0);
  const restSnapshot = await fetchNotificationSnapshot(user.id, '2026-09-13');
  assert.equal(restSnapshot.plan.day_type, 'REST');
  assert.equal(planNotices(restSnapshot, prefs, {}, Date.now()).immediate.length, 0);
  console.log(
    'PASS local DB notification snapshot: whole-day completion, STUDY-only overdue join, RETRY/confirmed/REST exclusions',
  );
} finally {
  await checked(admin.auth.admin.deleteUser(user.id));
}
