// Local-only SQL/concurrency checks and deterministic production UI handler checks.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

import ts from 'typescript';

import { uiMocks } from './ui-regression-mocks.mjs';

function load(path, mocks = {}) {
  const source = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  const module = { exports: {} };
  new Function(
    'require',
    'module',
    'exports',
    '__DEV__',
    ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    }).outputText,
  )(
    (id) => {
      mocks = uiMocks(mocks);
      if (!(id in mocks)) throw new Error(`Missing mock ${id}`);
      return mocks[id];
    },
    module,
    module.exports,
    false,
  );
  return module.exports;
}
const rules = load('src/features/learning/utils/task-order.ts');
assert.equal(rules.seoulDate(new Date('2026-09-16T14:59:59Z')), '2026-09-16');
assert.equal(rules.seoulDate(new Date('2026-09-16T15:00:00Z')), '2026-09-17');
const make = (id, sort_order, status = 'PLANNED', started_at = null) => ({
  id,
  sort_order,
  status,
  started_at,
  updated_at: 'v1',
  name_snapshot: id,
});
const a = make('A', 0),
  b = make('B', 2);
const excluded = [
  'IN_PROGRESS',
  'CHILD_COMPLETED',
  'RETRY',
  'PARENT_CONFIRMED',
  'PARTIAL',
  'SKIPPED',
].map((state, i) => make(state, i + 3, state));
assert.deepEqual(
  rules.editableTasks([b, ...excluded, a, make('started planned', 8, 'PLANNED', 'now')]),
  [a, b],
);
assert.deepEqual(rules.moveTask([a, b], 0, 1), [b, a]);
assert.deepEqual(rules.moveTask([a, b], 0, -1), [a, b]);
const priority = load('src/features/learning/utils/exception-tasks.ts');
assert.deepEqual(
  priority
    .prioritizeTodayTasks([b, a, make('retry', 8, 'RETRY'), make('started', 7, 'IN_PROGRESS')])
    .map((t) => t.id),
  ['started', 'retry', 'B', 'A'],
);

let rpcInput;
const api = load('src/features/learning/api/learning-api.ts', {
  '@/features/learning/utils/exception-tasks': priority,
  '@/lib/supabase/client': {
    getSupabaseClient: () => ({
      rpc: (name, input) => {
        assert.equal(name, 'reorder_daily_tasks');
        rpcInput = input;
        return { abortSignal: async () => ({ error: null }) };
      },
    }),
  },
});
await api.reorderDailyTasks({ planId: 'plan', tasks: [b, a] });
assert.deepEqual(
  rpcInput.ordered_tasks,
  [b, a].map((t) => ({
    id: t.id,
    expected_updated_at: t.updated_at,
    expected_sort_order: t.sort_order,
  })),
);

const slots = [];
let cursor = 0;
let rows = [a, b, ...excluded];
let saved;
let options;
let reloads = 0;
let date = '2026-09-16';
let calls = 0;
const react = {
  useCallback: (callback) => callback,
  useState(value) {
    const i = cursor++;
    if (!(i in slots)) slots[i] = typeof value === 'function' ? value() : value;
    return [
      slots[i],
      (v) => {
        slots[i] = typeof v === 'function' ? v(slots[i]) : v;
      },
    ];
  },
  useRef(value) {
    const i = cursor++;
    return slots[i] ?? (slots[i] = { current: value });
  },
  useEffect() {}, // No renderer/timer claim; date rollover is exercised through save guard.
};
const jsx = (type, props) => ({ type, props });
const panel = load('src/features/learning/components/task-order-panel.tsx', {
  '@/features/learning/components/task-drag-list': { TaskDragList: 'DragList' },
  '@/features/learning/api/learning-api': { TaskOrderError: api.TaskOrderError },
  react,
  'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
  'react-native': { Text: 'Text', View: 'View', AppState: {} },
  '@/features/learning/components/learning-controls': {
    LearningButton: 'Button',
    learningStyles: {},
  },
  '@/features/learning/utils/task-order': { ...rules, seoulDate: () => date },
  '@/features/learning/hooks/use-learning': {
    useDailyPlan: () => ({
      data: { id: 'plan' },
      refetch: async () => {
        reloads++;
        return { data: { id: 'plan' } };
      },
    }),
    useDailyTasks: () => ({
      data: rows,
      refetch: async () => {
        reloads++;
        return { data: rows, isError: false };
      },
    }),
    useReorderDailyTasks: () => ({
      isPending: false,
      mutate: (input, callbacks) => {
        calls++;
        saved = input;
        options = callbacks;
      },
    }),
  },
});
const render = () => {
  cursor = 0;
  return panel.TaskOrderPanel({ childId: 'child' });
};
const nodes = (t) =>
  !t || typeof t !== 'object'
    ? []
    : Array.isArray(t)
      ? t.flatMap(nodes)
      : [t, ...nodes(t.props?.children)];
const dragList = () => nodes(render()).find((n) => n.type === 'DragList').props;
const settle = () => new Promise((resolve) => setImmediate(resolve));
assert.deepEqual(dragList().draggableIds, ['A', 'B']);
assert.equal(Boolean(dragList().disabled), false);
dragList().onDragStateChange(true);
dragList().onMove(0, 0);
assert.equal(calls, 0, 'No-op drop does not save');
dragList().onMove(0, 1);
dragList().onMove(0, 1);
assert.equal(calls, 1, 'Duplicate drop blocked');
assert.deepEqual(
  saved.tasks.map((t) => t.id),
  ['B', 'A'],
);
rows = [{ ...b, sort_order: 0 }, { ...a, sort_order: 1 }, ...excluded];
options.onSuccess();
await settle();
assert.deepEqual(
  dragList()
    .tasks.slice(0, 2)
    .map((t) => t.id),
  ['B', 'A'],
);
dragList().onDragStateChange(true);
rows = [{ ...b, status: 'IN_PROGRESS' }, a];
dragList().onMove(0, 1);
assert.equal(calls, 1, 'Changed task cannot be reordered');
rows = [a, b];
dragList().onDragStateChange(true);
date = '2026-09-17';
dragList().onMove(0, 1);
assert.equal(calls, 1, 'Midnight drop rejected');
date = '2026-09-16';
dragList().onDragStateChange(true);
dragList().onMove(0, 1);
options.onError(new api.TaskOrderError('conflict'));
await settle();
assert.ok(reloads > 0);
assert.equal(Boolean(dragList().disabled), false);
assert.deepEqual(
  dragList().tasks.map((t) => t.id),
  ['A', 'B'],
);
console.log(
  'PASS UI/API: drop save, no-op, duplicate/stale/midnight guards, rollback/refetch and child priority',
);

if (!process.argv.includes('--ui-only')) {
  function sql(statement) {
    return new Promise((resolve, reject) => {
      const process = execFile(
        'docker',
        [
          'exec',
          '-i',
          'supabase_db_ssaida-app',
          'psql',
          '-U',
          'postgres',
          '-d',
          'postgres',
          '-At',
          '-v',
          'ON_ERROR_STOP=1',
        ],
        { encoding: 'utf8' },
        (error, stdout, stderr) =>
          error ? reject(new Error(stderr || error.message)) : resolve(stdout.trim()),
      );
      process.stdin.end(statement);
    });
  }
  await sql(
    readFileSync(new URL('../supabase/tests/sprint_2_reorder.sql', import.meta.url), 'utf8'),
  );
  console.log(
    'PASS SQL: ownership/permissions, dates, ID validation, every forbidden status, stale list/version, snapshots preserved',
  );
  const user = randomUUID();
  const asUser = (body) =>
    `begin; set local role authenticated; set local "request.jwt.claim.sub"='${user}'; ${body} commit;`;
  try {
    await sql(`insert into auth.users(id) values('${user}');`);
    await sql(asUser("select public.complete_parent_onboarding('Sprint2 concurrent',60,'1234');"));
    const child = await sql(
      `select c.id from public.children c join public.profiles p on p.id=c.parent_id where p.auth_user_id='${user}'`,
    );
    await sql(
      asUser(
        `select public.add_manual_daily_task('${child}',timezone('Asia/Seoul',clock_timestamp())::date,'ACTIVITY','First',null,null,null,5::smallint); select public.add_manual_daily_task('${child}',timezone('Asia/Seoul',clock_timestamp())::date,'ACTIVITY','Second',null,null,null,5::smallint);`,
      ),
    );
    const plan = await sql(`select id from public.daily_plans where child_id='${child}'`);
    const payload = await sql(
      `select jsonb_agg(jsonb_build_object('id',id,'expected_updated_at',updated_at,'expected_sort_order',sort_order) order by sort_order desc) from public.daily_tasks where daily_plan_id='${plan}'`,
    );
    const save = () =>
      sql(asUser(`select public.reorder_daily_tasks('${plan}','${payload}'::jsonb);`));
    const results = await Promise.allSettled([save(), save()]);
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    assert.match(results.find((r) => r.status === 'rejected').reason.message, /Task changed/);
    const after = JSON.parse(
      await sql(
        `select jsonb_agg(name_snapshot order by sort_order) from public.daily_tasks where daily_plan_id='${plan}'`,
      ),
    );
    assert.deepEqual(after, ['Second', 'First']);
    console.log('PASS independent DB sessions: competing saves accept one and reject stale writer');
    const freshPayload = await sql(
      `select jsonb_agg(jsonb_build_object('id',id,'expected_updated_at',updated_at,'expected_sort_order',sort_order) order by sort_order desc) from public.daily_tasks where daily_plan_id='${plan}'`,
    );
    const firstId = JSON.parse(freshPayload)[0].id;
    const racing = await Promise.allSettled([
      sql(asUser(`select public.reorder_daily_tasks('${plan}','${freshPayload}'::jsonb);`)),
      sql(asUser(`select public.start_daily_task('${firstId}');`)),
    ]);
    assert.equal(racing[1].status, 'fulfilled');
    if (racing[0].status === 'rejected')
      assert.match(racing[0].reason.message, /Editable task list changed/);
    assert.equal(
      await sql(`select status from public.daily_tasks where id='${firstId}'`),
      'IN_PROGRESS',
    );
    console.log('PASS independent DB sessions: reorder/start serialized, started task preserved');
  } finally {
    await sql(`delete from auth.users where id='${user}';`);
  }
}
