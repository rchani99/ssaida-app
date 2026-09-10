import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createClient } from '@supabase/supabase-js';
import ts from 'typescript';

const url = process.env.STEP3_API_URL;
const key = process.env.STEP3_ANON_KEY;
const serviceKey = process.env.STEP3_SERVICE_ROLE_KEY;
if (!url || !key || !serviceKey || !['localhost', '127.0.0.1'].includes(new URL(url).hostname))
  throw new Error('Local Supabase required');
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, serviceKey, options);
const client = createClient(url, key, options);
function load(path, imports = {}) {
  const module = { exports: {} };
  const output = ts.transpileModule(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  new Function('require', 'module', 'exports', '__DEV__', output)(
    (id) => {
      if (id in imports) return imports[id];
      throw new Error(`Unexpected import ${id}`);
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
async function checked(promise) {
  const result = await promise;
  assert.equal(result.error, null, result.error?.message);
  return result.data;
}
const email = `step5-${crypto.randomUUID()}@example.test`;
const password = crypto.randomUUID();
const created = await checked(
  admin.auth.admin.createUser({ email, password, email_confirm: true }),
);
try {
  await checked(client.auth.signInWithPassword({ email, password }));
  await checked(
    client.rpc('complete_parent_onboarding', {
      child_name: 'Step5 test',
      parent_pin: '1234',
      target_minutes: 60,
    }),
  );
  const child = await api.fetchCurrentChild();
  const makeItem = (name) =>
    api.createStudyItem({
      childId: child.id,
      itemType: 'WORKBOOK',
      name,
      subject: null,
      estimatedMinutes: 20,
      studyWeekdays: [1, 2, 3, 4, 5, 6, 7],
      workbookPagesPerSession: 5,
      workbookLastPage: 100,
    });
  const auto = async (item, date) =>
    (await api.fetchDailyTasks(await api.ensureDailyPlan(child.id, date))).find(
      (task) => task.study_item_id === item.id,
    );
  const done = async (task) => {
    await api.startDailyTask(task.id);
    await api.completeDailyTask(task.id);
  };
  const manual = async (name, date, itemType = 'ACTIVITY') =>
    api.fetchDailyTask(
      await api.addManualDailyTask({
        childId: child.id,
        planDate: date,
        name,
        itemType,
        subject: null,
        minutes: 20,
        startPage: itemType === 'WORKBOOK' ? 1 : null,
        endPage: itemType === 'WORKBOOK' ? 5 : null,
      }),
    );
  const a = await makeItem('A Partial');
  const at = await auto(a, '2026-09-01');
  await done(at);
  const drafts = { [at.id]: { status: 'PARTIAL', page: '3' } };
  const payload = rules.buildConfirmations([at], drafts, [a]);
  await api.confirmDailyTasks(payload);
  assert.equal((await api.fetchDailyTask(at.id)).status, 'PARTIAL');
  assert.equal(
    (await api.fetchStudyItems(child.id)).find((item) => item.id === a.id)
      .workbook_last_completed_page,
    3,
  );
  const an = await auto(a, '2026-09-02');
  assert.deepEqual([an.planned_start_page, an.planned_end_page], [4, 8]);
  for (const page of ['0', '5', '101', '', '1.5'])
    assert.throws(() =>
      rules.buildConfirmations([at], { [at.id]: { status: 'PARTIAL', page } }, [a]),
    );
  assert.equal(rules.buildConfirmations([at], { [at.id]: { page: '8' } }, [a])[0].actualEndPage, 8);
  assert.throws(() => rules.buildConfirmations([at], { [at.id]: { page: '101' } }, [a]));
  console.log('PASS A: PARTIAL 1-3; canonical=3; next=4-8; validation including full over-plan');
  const b = await makeItem('B Retry');
  const bt = await auto(b, '2026-09-03');
  await done(bt);
  await api.confirmDailyTasks([{ dailyTaskId: bt.id, status: 'RETRY', actualEndPage: null }]);
  const before = await api.fetchDailyTask(bt.id);
  assert.equal(await auto(b, '2026-09-04'), undefined);
  await api.startDailyTask(bt.id);
  const restarted = await api.fetchDailyTask(bt.id);
  assert.equal(restarted.status, 'IN_PROGRESS');
  for (const name of [
    'parent_verified_at',
    'child_completed_at',
    'reward_collection_theme_code',
    'actual_end_page',
  ])
    assert.equal(restarted[name], null);
  assert.equal(restarted.started_at, before.started_at);
  assert.equal(restarted.verification_attempt_count, before.verification_attempt_count);
  await api.completeDailyTask(bt.id);
  assert.ok((await api.fetchPendingConfirmations(child.id)).some((task) => task.id === bt.id));
  await api.confirmDailyTasks([
    { dailyTaskId: bt.id, status: 'PARENT_CONFIRMED', actualEndPage: 5 },
  ]);
  assert.equal((await api.fetchDailyTask(bt.id)).status, 'PARENT_CONFIRMED');
  console.log(
    'PASS B: RETRY blocks new AUTO; restart resets only transient fields; re-confirm succeeds',
  );
  const c = await Promise.all(['C1', 'C2', 'C3'].map((name) => manual(name, '2026-09-05')));
  for (const task of c) await done(task);
  await api.confirmDailyTasks(rules.buildConfirmations(c, { [c[2].id]: { selected: false } }, []));
  assert.deepEqual(
    await Promise.all(c.map(async (task) => (await api.fetchDailyTask(task.id)).status)),
    ['PARENT_CONFIRMED', 'PARENT_CONFIRMED', 'CHILD_COMPLETED'],
  );
  console.log('PASS C: selective batch leaves unselected child completion unchanged');
  const rest = await checked(
    client
      .from('children')
      .update({ rest_weekdays: [7] })
      .eq('id', child.id)
      .select()
      .single(),
  );
  assert.ok(rest);
  const d = await manual('D Rest manual', '2026-09-06', 'WORKBOOK');
  await done(d);
  assert.equal((await api.fetchDailyPlan(child.id, '2026-09-06')).day_type, 'REST');
  await api.confirmDailyTasks([
    { dailyTaskId: d.id, status: 'PARENT_CONFIRMED', actualEndPage: 5 },
  ]);
  const e = await manual('E Leaf', '2026-09-01');
  const eb = await api.rescheduleManualTask({ taskId: e.id, date: '2026-09-02' });
  assert.equal(await api.rescheduleManualTask({ taskId: e.id, date: '2026-09-02' }), eb);
  await assert.rejects(
    api.rescheduleManualTask({ taskId: e.id, date: '2026-09-03' }),
    /이미 다른 날짜/,
  );
  const ec = await api.rescheduleManualTask({ taskId: eb, date: '2026-09-03' });
  const unresolved = await api.fetchUnresolvedManualTasks(child.id, '2026-09-10');
  assert.ok(unresolved.some((task) => task.id === ec));
  assert.ok(!unresolved.some((task) => [e.id, eb].includes(task.id)));
  assert.equal((await api.fetchDailyTask(e.id)).status, 'PLANNED');
  assert.equal((await api.fetchDailyTask(e.id)).isSuperseded, true);
  assert.ok(!(await api.fetchDailyTasks(e.daily_plan_id)).some((task) => task.id === e.id));
  const g = await manual('G skip ongoing', '2026-09-04');
  await api.startDailyTask(g.id);
  await api.skipManualTask(g.id);
  assert.equal((await api.fetchDailyTask(g.id)).status, 'SKIPPED');
  assert.ok(
    !(await api.fetchUnresolvedManualTasks(child.id, '2026-09-10')).some(
      (task) => task.id === g.id,
    ),
  );
  console.log(
    'PASS D-G: REST manual, A-B-C leaf, idempotent same date, friendly conflict, skip/history',
  );
  const h = await makeItem('H Miss');
  const ht = await auto(h, '2026-09-07');
  const hn = await auto(h, '2026-09-08');
  assert.equal((await api.fetchDailyTask(ht.id)).status, 'PLANNED');
  assert.deepEqual([hn.planned_start_page, hn.planned_end_page], [1, 5]);
  assert.ok(
    !(await api.fetchUnresolvedManualTasks(child.id, '2026-09-10')).some(
      (task) => task.id === ht.id,
    ),
  );
  const i = await makeItem('I Conflict');
  const it = await auto(i, '2026-09-07');
  await done(it);
  const future = await auto(i, '2026-09-08');
  assert.deepEqual([future.planned_start_page, future.planned_end_page], [6, 10]);
  await api.startDailyTask(future.id);
  assert.ok(
    !rules
      .progressConflicts(await api.fetchReviewTasks(child.id), await api.fetchStudyItems(child.id))
      .some((task) => task.id === future.id),
  );
  await api.confirmDailyTasks([{ dailyTaskId: it.id, status: 'PARTIAL', actualEndPage: 3 }]);
  const preserved = await api.fetchDailyTask(future.id);
  assert.deepEqual(
    [preserved.status, preserved.planned_start_page, preserved.planned_end_page],
    ['IN_PROGRESS', 6, 10],
  );
  assert.ok(
    rules
      .progressConflicts(await api.fetchReviewTasks(child.id), await api.fetchStudyItems(child.id))
      .some((task) => task.id === future.id),
  );
  assert.deepEqual(
    rules
      .prioritizeTodayTasks([
        { status: 'PLANNED' },
        { status: 'SKIPPED' },
        { status: 'IN_PROGRESS' },
        { status: 'CHILD_COMPLETED' },
      ])
      .map((task) => task.status),
    ['IN_PROGRESS', 'PLANNED', 'CHILD_COMPLETED'],
  );
  assert.equal(
    rules.needsParentReminder(
      {
        status: 'CHILD_COMPLETED',
        parent_verified_at: null,
        child_completed_at: '2026-09-01T00:00:00Z',
      },
      Date.parse('2026-09-04T00:00:00Z'),
    ),
    true,
  );
  console.log(
    'PASS H-I: AUTO missed history preserved, late PARTIAL derived conflict; started range untouched',
  );
} finally {
  await checked(admin.auth.admin.deleteUser(created.user.id));
}
