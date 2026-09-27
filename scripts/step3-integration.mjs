import assert from 'node:assert/strict';

import { createClient } from '@supabase/supabase-js';

const url = process.env.STEP3_API_URL;
const anonKey = process.env.STEP3_ANON_KEY;
const serviceKey = process.env.STEP3_SERVICE_ROLE_KEY;

if (!url || !anonKey || !serviceKey) {
  throw new Error('STEP3 local Supabase environment is required');
}

const clientOptions = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, serviceKey, clientOptions);
const anon = createClient(url, anonKey, clientOptions);
const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

async function authenticatedUser(label) {
  const email = `step3-${label}-${suffix}@example.test`;
  const password = `Step3-${label}-Aa1!${suffix}`;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  assert.ifError(created.error);
  const client = createClient(url, anonKey, clientOptions);
  const signedIn = await client.auth.signInWithPassword({ email, password });
  assert.ifError(signedIn.error);
  assert.ok(signedIn.data.session?.access_token);
  return { client, userId: created.data.user.id, session: signedIn.data.session };
}

async function mustSucceed(resultPromise, label) {
  const result = await resultPromise;
  assert.equal(result.error, null, `${label}: ${result.error?.message}`);
  return result.data;
}

async function mustFail(resultPromise, label) {
  const result = await resultPromise;
  assert.ok(result.error, `${label}: expected failure`);
  return result.error;
}

async function onboard(client, name) {
  await mustSucceed(
    client.rpc('complete_parent_onboarding', {
      child_name: name,
      target_minutes: 60,
      parent_pin: '1234',
    }),
    `${name} onboarding`,
  );
  const profile = await mustSucceed(
    client.from('profiles').select('*').single(),
    `${name} profile`,
  );
  const child = await mustSucceed(client.from('children').select('*').single(), `${name} child`);
  return { profile, child };
}

async function addStudyItem(client, childId, values) {
  return mustSucceed(
    client
      .from('study_items')
      .insert({
        child_id: childId,
        item_type: values.itemType,
        name: values.name,
        subject: values.subject ?? 'OTHER',
        estimated_minutes: values.minutes ?? 20,
        study_weekdays: [1, 2, 3, 4, 5, 6, 7],
        workbook_pages_per_session: values.itemType === 'WORKBOOK' ? (values.pages ?? 5) : null,
        workbook_last_page: values.itemType === 'WORKBOOK' ? (values.last ?? 100) : null,
        workbook_last_completed_page:
          values.itemType === 'WORKBOOK' ? (values.completed ?? 0) : null,
      })
      .select('*')
      .single(),
    `insert ${values.name}`,
  );
}

async function ensure(client, childId, date, studyItemId) {
  const planId = await mustSucceed(
    client.rpc('ensure_daily_plan', { target_child_id: childId, target_plan_date: date }),
    `ensure ${date}`,
  );
  const query = client.from('daily_tasks').select('*').eq('daily_plan_id', planId);
  const rows = await mustSucceed(
    studyItemId ? query.eq('study_item_id', studyItemId) : query,
    `tasks ${date}`,
  );
  return { planId, task: rows[0], tasks: rows };
}

async function start(client, taskId) {
  await mustSucceed(client.rpc('start_daily_task', { target_daily_task_id: taskId }), 'start');
}

async function complete(client, taskId) {
  await mustSucceed(
    client.rpc('complete_daily_task', { target_daily_task_id: taskId }),
    'complete',
  );
}

async function confirm(client, taskId, status, actualEndPage = null) {
  await mustSucceed(
    client.rpc('confirm_daily_tasks', {
      task_confirmations: [{ daily_task_id: taskId, status, actual_end_page: actualEndPage }],
    }),
    `confirm ${status}`,
  );
}

async function pause(client, itemId) {
  await mustSucceed(
    client.from('study_items').update({ status: 'PAUSED' }).eq('id', itemId),
    'pause',
  );
}

const userA = await authenticatedUser('a');
const userB = await authenticatedUser('b');
const a = await onboard(userA.client, 'A child');
const b = await onboard(userB.client, 'B child');

// Auth, pgcrypto, ownership and direct-write boundaries.
const pin = await mustSucceed(
  admin.from('parent_pin_credentials').select('pin_hash').eq('parent_id', a.profile.id).single(),
  'PIN hash inspection',
);
assert.notEqual(pin.pin_hash, '1234');
assert.match(pin.pin_hash, /^\$2[aby]\$/);
await mustFail(
  anon.rpc('complete_parent_onboarding', {
    child_name: 'anon',
    target_minutes: 60,
    parent_pin: '1234',
  }),
  'anon onboarding',
);
const crossChildren = await mustSucceed(
  userA.client.from('children').select('id').eq('id', b.child.id),
  'cross child select',
);
assert.equal(crossChildren.length, 0);
await mustFail(
  userA.client.rpc('ensure_daily_plan', {
    target_child_id: b.child.id,
    target_plan_date: '2030-01-01',
  }),
  'foreign child RPC',
);
await mustFail(
  userA.client.from('children').update({ pending_growth_points: 9 }).eq('id', a.child.id),
  'direct pending update',
);
await mustFail(
  userA.client
    .from('children')
    .update({ selected_collection_theme_code: 'DINO' })
    .eq('id', a.child.id),
  'direct theme update',
);
await mustFail(anon.from('children').select('id'), 'anon protected select');

assert.equal(
  (await mustSucceed(userA.client.from('collectible_catalog').select('id'), 'catalog select'))
    .length,
  18,
);
for (const theme of ['DINO', 'GEM', 'ROBOT', 'DOLL', 'COIN', 'PLANT']) {
  assert.equal(
    (
      await mustSucceed(
        userA.client
          .from('collectible_catalog')
          .select('id')
          .eq('theme_code', theme)
          .eq('is_active', true),
        `${theme} seed`,
      )
    ).length,
    3,
  );
}
await mustFail(
  userA.client.from('collectible_catalog').insert({
    theme_code: 'DINO',
    code: `BAD_${suffix}`,
    name: 'Bad',
    growth_goal: 1,
    sort_order: 99,
  }),
  'catalog direct insert',
);

const bBook = await addStudyItem(userB.client, b.child.id, {
  itemType: 'WORKBOOK',
  name: 'B workbook',
  last: 20,
});
const bTask = await ensure(userB.client, b.child.id, '2030-01-01', bBook.id);
const bManual = await mustSucceed(
  userB.client.rpc('add_manual_daily_task', {
    target_child_id: b.child.id,
    target_plan_date: '2030-01-01',
    manual_item_type: 'ACTIVITY',
    manual_name: 'B manual',
    manual_subject: 'OTHER',
    manual_planned_start_page: null,
    manual_planned_end_page: null,
    manual_planned_minutes: 20,
  }),
  'B manual setup',
);
await mustSucceed(
  userB.client.rpc('select_collection_theme', { target_theme_code: 'DINO' }),
  'B theme setup',
);
const bCollectible = await mustSucceed(
  userB.client.from('child_collectibles').select('id').single(),
  'B collectible setup',
);
const bGrowthEvent = await mustSucceed(
  admin
    .from('collectible_growth_events')
    .insert({
      child_collectible_id: bCollectible.id,
      daily_task_id: null,
      growth_points: 0.1,
      source_type: 'PENDING_APPLY',
    })
    .select('id')
    .single(),
  'B growth event setup',
);

const crossSelects = [
  userA.client.from('study_items').select('id').eq('id', bBook.id),
  userA.client.from('daily_plans').select('id').eq('id', bTask.planId),
  userA.client.from('daily_tasks').select('id').eq('id', bTask.task.id),
  userA.client.from('child_collectibles').select('id').eq('id', bCollectible.id),
  userA.client.from('collectible_growth_events').select('id').eq('id', bGrowthEvent.id),
];
for (const [index, crossSelect] of crossSelects.entries()) {
  assert.equal((await mustSucceed(crossSelect, `cross-table select ${index}`)).length, 0);
}
await mustFail(
  userA.client.from('study_items').insert({
    child_id: b.child.id,
    item_type: 'ACTIVITY',
    name: 'foreign insert',
    estimated_minutes: 10,
    study_weekdays: [1],
  }),
  'foreign study item insert',
);

// Weekday constraints and DB-managed updated_at timestamps.
for (const [index, weekdays] of [[1], [1, 3, 5], [1, 2, 3, 4, 5, 6, 7]].entries()) {
  await mustSucceed(
    userA.client.from('study_items').insert({
      child_id: a.child.id,
      item_type: 'ACTIVITY',
      name: `valid weekdays ${index}`,
      estimated_minutes: 10,
      study_weekdays: weekdays,
      status: 'PAUSED',
    }),
    `valid weekdays ${index}`,
  );
}
for (const [index, weekdays] of [[], [0], [8], [1, null]].entries()) {
  await mustFail(
    userA.client.from('study_items').insert({
      child_id: a.child.id,
      item_type: 'ACTIVITY',
      name: `invalid weekdays ${index}`,
      estimated_minutes: 10,
      study_weekdays: weekdays,
      status: 'PAUSED',
    }),
    `invalid weekdays ${index}`,
  );
}
const childTimestampBefore = (
  await mustSucceed(
    userA.client.from('children').select('updated_at').single(),
    'child timestamp before',
  )
).updated_at;
await new Promise((resolve) => setTimeout(resolve, 5));
await mustSucceed(
  userA.client.from('children').update({ name: 'A child updated' }).eq('id', a.child.id),
  'child timestamp update',
);
assert.notEqual(
  (
    await mustSucceed(
      userA.client.from('children').select('updated_at').single(),
      'child timestamp after',
    )
  ).updated_at,
  childTimestampBefore,
);

const anonRpcCalls = [
  ['ensure_daily_plan', { target_child_id: a.child.id, target_plan_date: '2030-01-01' }],
  ['start_daily_task', { target_daily_task_id: bTask.task.id }],
  ['complete_daily_task', { target_daily_task_id: bTask.task.id }],
  ['undo_daily_task_completion', { target_daily_task_id: bTask.task.id }],
  [
    'add_manual_daily_task',
    {
      target_child_id: a.child.id,
      target_plan_date: '2030-01-01',
      manual_item_type: 'ACTIVITY',
      manual_name: 'anon',
      manual_subject: 'OTHER',
      manual_planned_start_page: null,
      manual_planned_end_page: null,
      manual_planned_minutes: 10,
    },
  ],
  ['reschedule_manual_task', { source_daily_task_id: bManual, target_plan_date: '2030-01-02' }],
  ['skip_manual_task', { target_daily_task_id: bManual }],
  [
    'confirm_daily_tasks',
    {
      task_confirmations: [
        { daily_task_id: bTask.task.id, status: 'PARENT_CONFIRMED', actual_end_page: 5 },
      ],
    },
  ],
  ['select_collection_theme', { target_theme_code: 'DINO' }],
  ['reveal_collectible', { target_child_collectible_id: bCollectible.id }],
];
for (const [rpcName, args] of anonRpcCalls) {
  await mustFail(anon.rpc(rpcName, args), `anon ${rpcName}`);
}

const foreignRpcCalls = [
  ['start_daily_task', { target_daily_task_id: bTask.task.id }],
  ['complete_daily_task', { target_daily_task_id: bTask.task.id }],
  ['undo_daily_task_completion', { target_daily_task_id: bTask.task.id }],
  [
    'add_manual_daily_task',
    {
      target_child_id: b.child.id,
      target_plan_date: '2030-01-02',
      manual_item_type: 'ACTIVITY',
      manual_name: 'foreign',
      manual_subject: 'OTHER',
      manual_planned_start_page: null,
      manual_planned_end_page: null,
      manual_planned_minutes: 10,
    },
  ],
  ['reschedule_manual_task', { source_daily_task_id: bManual, target_plan_date: '2030-01-02' }],
  ['skip_manual_task', { target_daily_task_id: bManual }],
  [
    'confirm_daily_tasks',
    {
      task_confirmations: [
        { daily_task_id: bTask.task.id, status: 'PARENT_CONFIRMED', actual_end_page: 5 },
      ],
    },
  ],
  ['reveal_collectible', { target_child_collectible_id: bCollectible.id }],
];
for (const [rpcName, args] of foreignRpcCalls) {
  await mustFail(userA.client.rpc(rpcName, args), `foreign ${rpcName}`);
}

// State transitions, theme snapshot, partial growth and collection overflow/reveal.
await mustSucceed(
  userA.client.rpc('select_collection_theme', { target_theme_code: 'DINO' }),
  'select DINO',
);
const initialDino = await mustSucceed(
  userA.client.from('child_collectibles').select('id').eq('theme_code', 'DINO').single(),
  'initial DINO',
);
await mustFail(
  userA.client.rpc('reveal_collectible', { target_child_collectible_id: initialDino.id }),
  'reveal growing collectible',
);
await mustFail(
  userA.client.rpc('select_collection_theme', { target_theme_code: 'UNKNOWN' }),
  'invalid theme',
);
const flowBook = await addStudyItem(userA.client, a.child.id, {
  itemType: 'WORKBOOK',
  name: 'Flow workbook',
  completed: 0,
  last: 20,
});
const flow = await ensure(userA.client, a.child.id, '2030-01-07', flowBook.id);
const flowRepeatedEnsure = await ensure(userA.client, a.child.id, '2030-01-07', flowBook.id);
assert.equal(flowRepeatedEnsure.planId, flow.planId);
assert.equal(flowRepeatedEnsure.task.id, flow.task.id);
await mustFail(
  userA.client.rpc('confirm_daily_tasks', {
    task_confirmations: [
      { daily_task_id: flow.task.id, status: 'PARENT_CONFIRMED', actual_end_page: 5 },
    ],
  }),
  'confirm before child completion',
);
await start(userA.client, flow.task.id);
await complete(userA.client, flow.task.id);
let flowRow = await mustSucceed(
  userA.client.from('daily_tasks').select('*').eq('id', flow.task.id).single(),
  'completed flow row',
);
assert.equal(flowRow.status, 'CHILD_COMPLETED');
assert.ok(flowRow.started_at && flowRow.child_completed_at);
assert.equal(flowRow.reward_collection_theme_code, 'DINO');
await mustSucceed(
  userA.client.rpc('undo_daily_task_completion', { target_daily_task_id: flow.task.id }),
  'undo',
);
assert.equal(
  (
    await mustSucceed(
      userA.client.from('daily_tasks').select('status').eq('id', flow.task.id).single(),
      'undo row',
    )
  ).status,
  'IN_PROGRESS',
);
await complete(userA.client, flow.task.id);
await mustFail(
  userA.client.rpc('select_collection_theme', { target_theme_code: 'GEM' }),
  'reject switch while DINO is growing',
);
await confirm(userA.client, flow.task.id, 'PARTIAL', 3);
const flowAfterConfirm = await mustSucceed(
  userA.client
    .from('daily_tasks')
    .select('verification_attempt_count')
    .eq('id', flow.task.id)
    .single(),
  'flow verification count',
);
await confirm(userA.client, flow.task.id, 'PARTIAL', 3);
assert.equal(
  (
    await mustSucceed(
      userA.client
        .from('daily_tasks')
        .select('verification_attempt_count')
        .eq('id', flow.task.id)
        .single(),
      'idempotent confirmation count',
    )
  ).verification_attempt_count,
  flowAfterConfirm.verification_attempt_count,
);
await mustFail(
  userA.client.rpc('undo_daily_task_completion', { target_daily_task_id: flow.task.id }),
  'undo finalized',
);
const dinoAfterPartial = await mustSucceed(
  userA.client.from('child_collectibles').select('*').eq('theme_code', 'DINO').single(),
  'DINO after partial',
);
assert.equal(Number(dinoAfterPartial.progress_points), 0.6);
assert.equal(dinoAfterPartial.status, 'GROWING');

const activity = await addStudyItem(userA.client, a.child.id, {
  itemType: 'ACTIVITY',
  name: 'Reading',
  minutes: 20,
});
const activityTask = await ensure(userA.client, a.child.id, '2030-01-08', activity.id);
await start(userA.client, activityTask.task.id);
await mustSucceed(
  userA.client.rpc('select_collection_theme', { target_theme_code: 'DINO' }),
  'reselect current DINO',
);
await complete(userA.client, activityTask.task.id);
await confirm(userA.client, activityTask.task.id, 'PARENT_CONFIRMED');
const completedDino = await mustSucceed(
  userA.client
    .from('child_collectibles')
    .select('*')
    .eq('theme_code', 'DINO')
    .eq('status', 'COMPLETED')
    .single(),
  'completed DINO',
);
assert.equal(Number(completedDino.progress_points), 1);
assert.equal(completedDino.revealed_at, null);
await mustFail(
  userA.client.rpc('select_collection_theme', { target_theme_code: 'GEM' }),
  'reject switch while DINO awaits reveal',
);
assert.equal(
  Number(
    (
      await mustSucceed(
        userA.client.from('children').select('pending_growth_points').single(),
        'pending overflow',
      )
    ).pending_growth_points,
  ),
  0.6,
);
await mustSucceed(
  userA.client.rpc('reveal_collectible', { target_child_collectible_id: completedDino.id }),
  'reveal DINO',
);
await mustSucceed(
  userA.client.rpc('reveal_collectible', { target_child_collectible_id: completedDino.id }),
  'reveal DINO idempotent',
);
const dinoRows = await mustSucceed(
  userA.client.from('child_collectibles').select('*').eq('theme_code', 'DINO').order('sequence_no'),
  'DINO collection',
);
assert.equal(dinoRows.length, 2);
assert.equal(dinoRows[0].revealed_at !== null, true);
assert.equal(dinoRows[1].status, 'GROWING');
assert.equal(Number(dinoRows[1].progress_points), 0.6);
assert.equal(new Set(dinoRows.map((row) => row.collectible_catalog_id)).size, dinoRows.length);

// Pending applies to one collectible at a time and stops at each unrevealed completion.
const collectionTask2 = await ensure(userA.client, a.child.id, '2030-01-29', activity.id);
await start(userA.client, collectionTask2.task.id);
await complete(userA.client, collectionTask2.task.id);
await confirm(userA.client, collectionTask2.task.id, 'PARENT_CONFIRMED');
let waitingDino = await mustSucceed(
  userA.client
    .from('child_collectibles')
    .select('*')
    .eq('theme_code', 'DINO')
    .eq('status', 'COMPLETED')
    .is('revealed_at', null)
    .single(),
  'second completed DINO',
);
assert.equal(
  (
    await mustSucceed(
      userA.client.from('child_collectibles').select('id').eq('theme_code', 'DINO'),
      'two DINO rows',
    )
  ).length,
  2,
);
await mustSucceed(
  userA.client.rpc('reveal_collectible', { target_child_collectible_id: waitingDino.id }),
  'reveal second DINO',
);
let allDino = await mustSucceed(
  userA.client.from('child_collectibles').select('*').eq('theme_code', 'DINO').order('sequence_no'),
  'three DINO rows',
);
assert.equal(allDino.length, 3);
assert.equal(allDino[2].status, 'GROWING');
assert.equal(Number(allDino[2].progress_points), 0.6);

const collectionTask3 = await ensure(userA.client, a.child.id, '2030-01-30', activity.id);
await start(userA.client, collectionTask3.task.id);
await complete(userA.client, collectionTask3.task.id);
await confirm(userA.client, collectionTask3.task.id, 'PARENT_CONFIRMED');
waitingDino = await mustSucceed(
  userA.client
    .from('child_collectibles')
    .select('*')
    .eq('theme_code', 'DINO')
    .eq('status', 'COMPLETED')
    .is('revealed_at', null)
    .single(),
  'third completed DINO',
);
await mustSucceed(
  userA.client.rpc('reveal_collectible', { target_child_collectible_id: waitingDino.id }),
  'reveal final DINO',
);
allDino = await mustSucceed(
  userA.client.from('child_collectibles').select('*').eq('theme_code', 'DINO'),
  'all DINO collected',
);
assert.equal(allDino.length, 3);
assert.equal(allDino.filter((row) => row.status === 'GROWING').length, 0);

const pendingBeforeExhaustedGrowth = Number(
  (
    await mustSucceed(
      userA.client.from('children').select('pending_growth_points').single(),
      'pending before exhausted',
    )
  ).pending_growth_points,
);
const collectionTask4 = await ensure(userA.client, a.child.id, '2030-01-31', activity.id);
await start(userA.client, collectionTask4.task.id);
await complete(userA.client, collectionTask4.task.id);
await confirm(userA.client, collectionTask4.task.id, 'PARENT_CONFIRMED');
assert.equal(
  Number(
    (
      await mustSucceed(
        userA.client.from('children').select('pending_growth_points').single(),
        'pending after exhausted',
      )
    ).pending_growth_points,
  ),
  pendingBeforeExhaustedGrowth + 1,
);
assert.ok(allDino.every((item) => item.revealed_at !== null));
await mustSucceed(
  userA.client.rpc('select_collection_theme', { target_theme_code: 'GEM' }),
  'switch after all active DINO items are revealed',
);
await mustFail(
  userA.client.from('child_collectibles').update({ progress_points: 0 }).eq('id', dinoRows[1].id),
  'direct collectible update',
);
await mustFail(
  userA.client.from('child_collectibles').delete().eq('id', dinoRows[1].id),
  'direct collectible delete',
);
await mustFail(
  userA.client.from('child_collectibles').insert({
    child_id: a.child.id,
    theme_code: 'DINO',
    collectible_catalog_id: dinoRows[0].collectible_catalog_id,
    sequence_no: 99,
    growth_goal_snapshot: 1,
  }),
  'direct collectible insert',
);
await mustFail(
  userA.client.from('collectible_growth_events').insert({
    child_collectible_id: dinoRows[1].id,
    daily_task_id: null,
    growth_points: 1,
    source_type: 'PENDING_APPLY',
  }),
  'direct growth event insert',
);
await mustFail(
  userA.client
    .from('collectible_growth_events')
    .update({ growth_points: 9 })
    .eq('child_collectible_id', dinoRows[1].id),
  'direct growth event update',
);
await mustFail(
  userA.client
    .from('collectible_growth_events')
    .delete()
    .eq('child_collectible_id', dinoRows[1].id),
  'direct growth event delete',
);

// A concurrent switch is rejected even when confirmation completes an unrevealed item.
const bActivity = await addStudyItem(userB.client, b.child.id, {
  itemType: 'ACTIVITY',
  name: 'B snapshot activity',
});
const snapshotTask = await ensure(userB.client, b.child.id, '2030-02-01', bActivity.id);
await start(userB.client, snapshotTask.task.id);
await complete(userB.client, snapshotTask.task.id);
const snapshotBefore = await mustSucceed(
  userB.client
    .from('daily_tasks')
    .select('reward_collection_theme_code')
    .eq('id', snapshotTask.task.id)
    .single(),
  'snapshot before race',
);
assert.equal(snapshotBefore.reward_collection_theme_code, 'DINO');
const dinoBefore = Number(
  (
    await mustSucceed(
      userB.client
        .from('child_collectibles')
        .select('progress_points')
        .eq('theme_code', 'DINO')
        .single(),
      'DINO before race',
    )
  ).progress_points,
);
const gemBefore = Number(
  (
    await mustSucceed(
      userB.client
        .from('child_collectibles')
        .select('progress_points')
        .eq('theme_code', 'GEM')
        .maybeSingle(),
      'GEM before race',
    )
  )?.progress_points ?? 0,
);
const themeRaceA = createClient(url, anonKey, clientOptions);
const themeRaceB = createClient(url, anonKey, clientOptions);
await themeRaceA.auth.setSession({
  access_token: userB.session.access_token,
  refresh_token: userB.session.refresh_token,
});
await themeRaceB.auth.setSession({
  access_token: userB.session.access_token,
  refresh_token: userB.session.refresh_token,
});
const themeRace = await Promise.all([
  themeRaceA.rpc('select_collection_theme', { target_theme_code: 'GEM' }),
  themeRaceB.rpc('confirm_daily_tasks', {
    task_confirmations: [
      { daily_task_id: snapshotTask.task.id, status: 'PARENT_CONFIRMED', actual_end_page: null },
    ],
  }),
]);
assert.equal(themeRace[0].error?.code, '22023');
assert.equal(themeRace[1].error, null, themeRace[1].error?.message);
assert.equal(
  Number(
    (
      await mustSucceed(
        userB.client
          .from('child_collectibles')
          .select('progress_points')
          .eq('theme_code', 'DINO')
          .single(),
        'DINO after race',
      )
    ).progress_points,
  ),
  dinoBefore + 1,
);
assert.equal(
  Number(
    (
      await mustSucceed(
        userB.client
          .from('child_collectibles')
          .select('progress_points')
          .eq('theme_code', 'GEM')
          .maybeSingle(),
        'GEM after race',
      )
    )?.progress_points ?? 0,
  ),
  gemBefore,
);
await pause(userA.client, flowBook.id);
await pause(userA.client, activity.id);

// Temporary progress and future PLANNED recalculation.
const partialBook = await addStudyItem(userA.client, a.child.id, {
  itemType: 'WORKBOOK',
  name: 'Temporary progress',
  completed: 27,
  last: 80,
});
const partialDay1 = await ensure(userA.client, a.child.id, '2030-01-09', partialBook.id);
assert.deepEqual(
  [partialDay1.task.planned_start_page, partialDay1.task.planned_end_page],
  [28, 32],
);
await start(userA.client, partialDay1.task.id);
await complete(userA.client, partialDay1.task.id);
const partialDay2 = await ensure(userA.client, a.child.id, '2030-01-10', partialBook.id);
assert.deepEqual(
  [partialDay2.task.planned_start_page, partialDay2.task.planned_end_page],
  [33, 37],
);
assert.equal(
  (
    await mustSucceed(
      userA.client.from('study_items').select('*').eq('id', partialBook.id).single(),
      'canonical progress',
    )
  ).workbook_last_completed_page,
  27,
);
await confirm(userA.client, partialDay1.task.id, 'PARTIAL', 30);
const recalculated = await mustSucceed(
  userA.client.from('daily_tasks').select('*').eq('id', partialDay2.task.id).single(),
  'recalculated future',
);
assert.deepEqual([recalculated.planned_start_page, recalculated.planned_end_page], [31, 35]);
await pause(userA.client, partialBook.id);

// IN_PROGRESS/RETRY blockers and PLANNED non-carryover for WORKBOOK and ACTIVITY.
const blockerBook = await addStudyItem(userA.client, a.child.id, {
  itemType: 'WORKBOOK',
  name: 'Workbook blocker',
  last: 50,
});
const blocker1 = await ensure(userA.client, a.child.id, '2030-01-11', blockerBook.id);
await start(userA.client, blocker1.task.id);
assert.equal(
  (await ensure(userA.client, a.child.id, '2030-01-12', blockerBook.id)).task,
  undefined,
);
await complete(userA.client, blocker1.task.id);
await confirm(userA.client, blocker1.task.id, 'RETRY');
const retryConfirmed = await mustSucceed(
  userA.client.from('daily_tasks').select('*').eq('id', blocker1.task.id).single(),
  'RETRY confirmed',
);
assert.ok(retryConfirmed.parent_verified_at);
assert.equal(retryConfirmed.verification_attempt_count, 1);
assert.equal(
  (await ensure(userA.client, a.child.id, '2030-01-13', blockerBook.id)).task,
  undefined,
);
await start(userA.client, blocker1.task.id);
const retryRestarted = await mustSucceed(
  userA.client.from('daily_tasks').select('*').eq('id', blocker1.task.id).single(),
  'RETRY restarted',
);
assert.equal(retryRestarted.status, 'IN_PROGRESS');
assert.equal(retryRestarted.parent_verified_at, null);
assert.equal(retryRestarted.child_completed_at, null);
assert.equal(retryRestarted.reward_collection_theme_code, null);
assert.equal(retryRestarted.actual_end_page, null);
assert.equal(retryRestarted.verification_attempt_count, 1);
assert.equal(retryRestarted.started_at, retryConfirmed.started_at);
await complete(userA.client, blocker1.task.id);
const retryCompleted = await mustSucceed(
  userA.client.from('daily_tasks').select('*').eq('id', blocker1.task.id).single(),
  'RETRY completed again',
);
assert.equal(retryCompleted.status, 'CHILD_COMPLETED');
assert.equal(retryCompleted.parent_verified_at, null);
await mustSucceed(
  userA.client.rpc('undo_daily_task_completion', { target_daily_task_id: blocker1.task.id }),
  'undo retried completion',
);
await complete(userA.client, blocker1.task.id);
await mustSucceed(
  admin
    .from('daily_tasks')
    .update({ child_completed_at: new Date(Date.now() - 4 * 86_400_000).toISOString() })
    .eq('id', blocker1.task.id),
  'age retry reminder fixture',
);
assert.equal(
  (
    await mustSucceed(
      userA.client
        .from('daily_tasks')
        .select('id')
        .eq('id', blocker1.task.id)
        .eq('status', 'CHILD_COMPLETED')
        .is('parent_verified_at', null)
        .lte('child_completed_at', new Date(Date.now() - 3 * 86_400_000).toISOString()),
      'retried reminder eligibility',
    )
  ).length,
  1,
);
await pause(userA.client, blockerBook.id);

const plannedBook = await addStudyItem(userA.client, a.child.id, {
  itemType: 'WORKBOOK',
  name: 'Unstarted workbook',
  completed: 27,
  last: 50,
});
const planned1 = await ensure(userA.client, a.child.id, '2030-01-14', plannedBook.id);
const planned2 = await ensure(userA.client, a.child.id, '2030-01-15', plannedBook.id);
assert.deepEqual([planned1.task.planned_start_page, planned1.task.planned_end_page], [28, 32]);
assert.deepEqual([planned2.task.planned_start_page, planned2.task.planned_end_page], [28, 32]);
await pause(userA.client, plannedBook.id);

const blockerActivity = await addStudyItem(userA.client, a.child.id, {
  itemType: 'ACTIVITY',
  name: 'Activity blocker',
});
const ba1 = await ensure(userA.client, a.child.id, '2030-01-16', blockerActivity.id);
await start(userA.client, ba1.task.id);
assert.equal(
  (await ensure(userA.client, a.child.id, '2030-01-17', blockerActivity.id)).task,
  undefined,
);
await pause(userA.client, blockerActivity.id);

// REST plan keeps manual work; manual reschedule is idempotent and SKIPPED is manual-only.
await mustSucceed(
  userA.client
    .from('children')
    .update({ rest_weekdays: [1, 2, 3, 4, 5, 6, 7] })
    .eq('id', a.child.id),
  'set rest weekdays',
);
const restPlan = await ensure(userA.client, a.child.id, '2030-01-18');
assert.equal(restPlan.tasks.length, 0);
assert.equal(
  (
    await mustSucceed(
      userA.client.from('daily_plans').select('*').eq('id', restPlan.planId).single(),
      'REST plan',
    )
  ).day_type,
  'REST',
);
const manualTaskId = await mustSucceed(
  userA.client.rpc('add_manual_daily_task', {
    target_child_id: a.child.id,
    target_plan_date: '2030-01-18',
    manual_item_type: 'ACTIVITY',
    manual_name: 'School homework',
    manual_subject: 'OTHER',
    manual_planned_start_page: null,
    manual_planned_end_page: null,
    manual_planned_minutes: 20,
  }),
  'manual on REST',
);
const rescheduled1 = await mustSucceed(
  userA.client.rpc('reschedule_manual_task', {
    source_daily_task_id: manualTaskId,
    target_plan_date: '2030-01-19',
  }),
  'reschedule manual',
);
const rescheduled2 = await mustSucceed(
  userA.client.rpc('reschedule_manual_task', {
    source_daily_task_id: manualTaskId,
    target_plan_date: '2030-01-19',
  }),
  'reschedule manual idempotent',
);
assert.equal(rescheduled1, rescheduled2);
const differentDateRescheduleError = await mustFail(
  userA.client.rpc('reschedule_manual_task', {
    source_daily_task_id: manualTaskId,
    target_plan_date: '2030-03-01',
  }),
  'reschedule same source different date',
);
assert.equal(differentDateRescheduleError.code, '22023');
assert.match(differentDateRescheduleError.message, /already been rescheduled/i);
const chainedReschedule = await mustSucceed(
  userA.client.rpc('reschedule_manual_task', {
    source_daily_task_id: rescheduled1,
    target_plan_date: '2030-03-01',
  }),
  'reschedule chain',
);
assert.notEqual(chainedReschedule, rescheduled1);
assert.equal(
  (
    await mustSucceed(
      userA.client.from('daily_tasks').select('status').eq('id', manualTaskId).single(),
      'manual source unchanged',
    )
  ).status,
  'PLANNED',
);
const completedManual = await mustSucceed(
  userA.client.rpc('add_manual_daily_task', {
    target_child_id: a.child.id,
    target_plan_date: '2030-01-18',
    manual_item_type: 'ACTIVITY',
    manual_name: 'Completed manual',
    manual_subject: 'OTHER',
    manual_planned_start_page: null,
    manual_planned_end_page: null,
    manual_planned_minutes: 20,
  }),
  'completed manual setup',
);
await start(userA.client, completedManual);
await complete(userA.client, completedManual);
await mustFail(
  userA.client.rpc('reschedule_manual_task', {
    source_daily_task_id: completedManual,
    target_plan_date: '2030-01-20',
  }),
  'reschedule child-completed source',
);
await mustSucceed(
  userA.client.rpc('skip_manual_task', { target_daily_task_id: manualTaskId }),
  'skip manual',
);
await mustFail(
  userA.client.rpc('skip_manual_task', { target_daily_task_id: planned1.task.id }),
  'skip AUTO',
);
await mustFail(
  userA.client.from('daily_tasks').insert({
    daily_plan_id: restPlan.planId,
    source_type: 'MANUAL',
    item_type: 'ACTIVITY',
    name_snapshot: 'direct',
    planned_minutes: 10,
    sort_order: 99,
  }),
  'direct daily task insert',
);
await mustFail(
  userA.client.from('daily_tasks').update({ status: 'SKIPPED' }).eq('id', manualTaskId),
  'direct daily task update',
);
await mustFail(
  userA.client.rpc('reschedule_manual_task', {
    source_daily_task_id: manualTaskId,
    target_plan_date: '2030-01-20',
  }),
  'reschedule finalized manual',
);
await mustSucceed(
  userA.client.from('children').update({ rest_weekdays: [] }).eq('id', a.child.id),
  'clear rest weekdays',
);

// Workbook completion removes only future PLANNED AUTO and keeps plans/started rows/history.
const completionBook = await addStudyItem(userA.client, a.child.id, {
  itemType: 'WORKBOOK',
  name: 'Completion cleanup',
  completed: 90,
  last: 100,
});
const oldPlanned = await ensure(userA.client, a.child.id, '2030-01-20', completionBook.id);
const completionDay1 = await ensure(userA.client, a.child.id, '2030-01-21', completionBook.id);
await start(userA.client, completionDay1.task.id);
await complete(userA.client, completionDay1.task.id);
const invalidFuture = await ensure(userA.client, a.child.id, '2030-01-22', completionBook.id);
await confirm(userA.client, completionDay1.task.id, 'PARENT_CONFIRMED', 100);
assert.equal(
  (
    await mustSucceed(
      userA.client.from('study_items').select('status').eq('id', completionBook.id).single(),
      'completed item',
    )
  ).status,
  'COMPLETED',
);
assert.equal(
  (
    await mustSucceed(
      userA.client.from('daily_tasks').select('id').eq('id', invalidFuture.task.id),
      'invalid future',
    )
  ).length,
  0,
);
assert.equal(
  (
    await mustSucceed(
      userA.client.from('daily_tasks').select('status').eq('id', oldPlanned.task.id).single(),
      'past planned',
    )
  ).status,
  'PLANNED',
);
assert.equal(
  (
    await mustSucceed(
      userA.client.from('daily_plans').select('id').eq('id', invalidFuture.planId),
      'kept plan',
    )
  ).length,
  1,
);

const startedCompletion = await addStudyItem(userA.client, a.child.id, {
  itemType: 'WORKBOOK',
  name: 'Started future preserved',
  completed: 90,
  last: 100,
});
const sc1 = await ensure(userA.client, a.child.id, '2030-01-23', startedCompletion.id);
await start(userA.client, sc1.task.id);
await complete(userA.client, sc1.task.id);
const sc2 = await ensure(userA.client, a.child.id, '2030-01-24', startedCompletion.id);
await start(userA.client, sc2.task.id);
await confirm(userA.client, sc1.task.id, 'PARENT_CONFIRMED', 100);
assert.equal(
  (
    await mustSucceed(
      userA.client.from('daily_tasks').select('status').eq('id', sc2.task.id).single(),
      'future started',
    )
  ).status,
  'IN_PROGRESS',
);

// Two independent HTTP clients race confirm vs ensure; child lock serializes both outcomes.
const concurrentA = createClient(url, anonKey, clientOptions);
const concurrentB = createClient(url, anonKey, clientOptions);
await concurrentA.auth.setSession({
  access_token: userA.session.access_token,
  refresh_token: userA.session.refresh_token,
});
await concurrentB.auth.setSession({
  access_token: userA.session.access_token,
  refresh_token: userA.session.refresh_token,
});
const raceBook = await addStudyItem(userA.client, a.child.id, {
  itemType: 'WORKBOOK',
  name: 'Partial race',
  completed: 27,
  last: 100,
});
const race1 = await ensure(userA.client, a.child.id, '2030-01-25', raceBook.id);
await start(userA.client, race1.task.id);
await complete(userA.client, race1.task.id);
const raceResults = await Promise.all([
  concurrentA.rpc('confirm_daily_tasks', {
    task_confirmations: [{ daily_task_id: race1.task.id, status: 'PARTIAL', actual_end_page: 30 }],
  }),
  concurrentB.rpc('ensure_daily_plan', {
    target_child_id: a.child.id,
    target_plan_date: '2030-01-26',
  }),
]);
assert.equal(raceResults[0].error, null, raceResults[0].error?.message);
assert.equal(raceResults[1].error, null, raceResults[1].error?.message);
const raceTask = await mustSucceed(
  userA.client
    .from('daily_tasks')
    .select('planned_start_page,planned_end_page,daily_plans!inner(plan_date)')
    .eq('study_item_id', raceBook.id)
    .eq('daily_plans.plan_date', '2030-01-26')
    .single(),
  'partial race result',
);
assert.deepEqual([raceTask.planned_start_page, raceTask.planned_end_page], [31, 35]);

const completeRaceBook = await addStudyItem(userA.client, a.child.id, {
  itemType: 'WORKBOOK',
  name: 'Completion race',
  completed: 95,
  last: 100,
});
const cr1 = await ensure(userA.client, a.child.id, '2030-01-27', completeRaceBook.id);
await start(userA.client, cr1.task.id);
await complete(userA.client, cr1.task.id);
const completionRace = await Promise.all([
  concurrentA.rpc('confirm_daily_tasks', {
    task_confirmations: [
      { daily_task_id: cr1.task.id, status: 'PARENT_CONFIRMED', actual_end_page: 100 },
    ],
  }),
  concurrentB.rpc('ensure_daily_plan', {
    target_child_id: a.child.id,
    target_plan_date: '2030-01-28',
  }),
]);
assert.equal(completionRace[0].error, null, completionRace[0].error?.message);
assert.equal(completionRace[1].error, null, completionRace[1].error?.message);
assert.equal(
  (
    await mustSucceed(
      userA.client
        .from('daily_tasks')
        .select('id,daily_plans!inner(plan_date)')
        .eq('study_item_id', completeRaceBook.id)
        .eq('daily_plans.plan_date', '2030-01-28'),
      'completion race result',
    )
  ).length,
  0,
);

// Three-day reminder PostgREST query with positive and negative controls.
const reminderPlan = await mustSucceed(
  admin
    .from('daily_plans')
    .insert({
      child_id: a.child.id,
      plan_date: '2029-01-01',
      day_type: 'STUDY',
      target_minutes_snapshot: 60,
    })
    .select('id')
    .single(),
  'reminder plan',
);
const restReminderPlan = await mustSucceed(
  admin
    .from('daily_plans')
    .insert({
      child_id: a.child.id,
      plan_date: '2029-01-02',
      day_type: 'REST',
      target_minutes_snapshot: 60,
    })
    .select('id')
    .single(),
  'REST reminder plan',
);
const oldTime = new Date(Date.now() - 4 * 86_400_000).toISOString();
const recentTime = new Date(Date.now() - 2 * 86_400_000).toISOString();
await mustSucceed(
  admin.from('daily_tasks').insert([
    {
      daily_plan_id: reminderPlan.id,
      source_type: 'MANUAL',
      item_type: 'ACTIVITY',
      name_snapshot: 'due',
      planned_minutes: 10,
      sort_order: 0,
      status: 'CHILD_COMPLETED',
      child_completed_at: oldTime,
    },
    {
      daily_plan_id: reminderPlan.id,
      source_type: 'MANUAL',
      item_type: 'ACTIVITY',
      name_snapshot: 'recent',
      planned_minutes: 10,
      sort_order: 1,
      status: 'CHILD_COMPLETED',
      child_completed_at: recentTime,
    },
    {
      daily_plan_id: reminderPlan.id,
      source_type: 'MANUAL',
      item_type: 'ACTIVITY',
      name_snapshot: 'started',
      planned_minutes: 10,
      sort_order: 2,
      status: 'IN_PROGRESS',
      started_at: oldTime,
    },
    {
      daily_plan_id: reminderPlan.id,
      source_type: 'MANUAL',
      item_type: 'ACTIVITY',
      name_snapshot: 'planned',
      planned_minutes: 10,
      sort_order: 3,
      status: 'PLANNED',
    },
    {
      daily_plan_id: reminderPlan.id,
      source_type: 'MANUAL',
      item_type: 'ACTIVITY',
      name_snapshot: 'verified',
      planned_minutes: 10,
      sort_order: 4,
      status: 'PARENT_CONFIRMED',
      child_completed_at: oldTime,
      parent_verified_at: new Date().toISOString(),
    },
    {
      daily_plan_id: restReminderPlan.id,
      source_type: 'MANUAL',
      item_type: 'ACTIVITY',
      name_snapshot: 'rest-old',
      planned_minutes: 10,
      sort_order: 0,
      status: 'CHILD_COMPLETED',
      child_completed_at: oldTime,
    },
  ]),
  'reminder fixtures',
);
const reminderRows = await mustSucceed(
  userA.client
    .from('daily_tasks')
    .select('name_snapshot,daily_plans!inner(day_type)')
    .eq('status', 'CHILD_COMPLETED')
    .is('parent_verified_at', null)
    .lte('child_completed_at', new Date(Date.now() - 3 * 86_400_000).toISOString())
    .eq('daily_plans.day_type', 'STUDY'),
  'reminder PostgREST query',
);
assert.deepEqual(
  reminderRows.map((row) => row.name_snapshot).sort(),
  ['Workbook blocker', 'due'].sort(),
);

console.log('PASS auth-pgcrypto-postgrest');
console.log('PASS rls-ownership-direct-write');
console.log('PASS state-manual-rest-progress');
console.log('PASS collection-growth-reveal');
console.log('PASS invalid-future-auto-cleanup');
console.log('PASS independent-http-concurrency');
console.log('PASS reminder-query');
