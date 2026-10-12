// Execute production selection and event handlers with deterministic query mocks.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import ts from 'typescript';

function load(path, imports = {}) {
  const module = { exports: {} };
  const source = ts.transpileModule(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  new Function('require', 'module', 'exports', source)(
    (id) => {
      assert.ok(id in imports, `Missing fixture: ${id}`);
      return imports[id];
    },
    module,
    module.exports,
  );
  return module.exports;
}
const selection = load('src/features/learning/utils/next-study.ts', {
  '@/features/learning/utils/exception-tasks': load(
    'src/features/learning/utils/exception-tasks.ts',
  ),
  '@/features/learning/utils/visible-tasks': load('src/features/learning/utils/visible-tasks.ts'),
});
const { nextStudyTask } = selection;
const done = { id: 'done', status: 'CHILD_COMPLETED', planned_minutes: 10 };
const next = { ...done, id: 'next', status: 'PLANNED', name_snapshot: '다음 문제집' };
assert.equal(nextStudyTask([{ ...done, status: 'IN_PROGRESS' }, next], [], 'done'), next);
assert.equal(nextStudyTask([done], [], 'done'), undefined);
for (const state of [
  { excluded_for_today: true },
  { quantity_conflict: 'GAP' },
  { status: 'SKIPPED' },
  { status: 'PARENT_CONFIRMED' },
  { status: 'CHILD_COMPLETED' },
  { status: 'PARTIAL' },
]) {
  assert.equal(nextStudyTask([done, { ...next, ...state }], [], 'done'), undefined);
}
const retry = { ...next, id: 'retry', status: 'RETRY' };
const underway = { ...next, id: 'underway', status: 'IN_PROGRESS' };
const past = { ...underway, id: 'past' };
assert.equal(nextStudyTask([next, retry, underway], [], 'done'), underway);
assert.equal(nextStudyTask([next, retry], [], 'done'), retry);
assert.equal(nextStudyTask([next], [past], 'done'), past);
assert.equal(nextStudyTask([next], [{ ...past, status: 'PLANNED' }], 'done'), next);
const moved = { ...next, id: 'moved', source_daily_task_id: 'past' };
assert.equal(nextStudyTask([moved], [past], 'done'), moved);
assert.equal(nextStudyTask([next, { ...next, id: 'second' }], [], 'done'), next);

const jsx = (type, props) => ({ type, props });
const nodes = (tree) =>
  Array.isArray(tree)
    ? tree.flatMap(nodes)
    : tree && typeof tree === 'object'
      ? [tree, ...nodes(tree.props?.children)]
      : [];
const native = new Proxy({ StyleSheet: { create: (v) => v } }, { get: (o, k) => o[k] ?? k });
let tasks;
let continuing;
let child;
let plan;
let mutation;
let lock;
let routes;
let calls;
let callbacks;
let refetches;
const query = (data, name) => ({ data, refetch: () => refetches.push(name) });
function reset(rows = [done, next], pastRows = []) {
  tasks = query(rows, 'tasks');
  continuing = query(pastRows, 'continuing');
  child = query({ id: 'child' }, 'child');
  plan = query({ id: 'plan' }, 'plan');
  lock = { current: false };
  routes = [];
  calls = [];
  refetches = [];
  callbacks = undefined;
  mutation = {
    isPending: false,
    mutate: (id, cb) => {
      calls.push(id);
      callbacks = cb;
    },
  };
}
const { StudyCompletionActions } = load(
  'src/features/learning/components/study-completion-actions.tsx',
  {
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': native,
    react: { useRef: () => lock },
    'expo-router': { useRouter: () => ({ replace: (route) => routes.push(route) }) },
    '@/design-system/tokens': load('src/design-system/tokens.ts'),
    '@/features/learning/components/learning-controls': { LearningButton: 'Button' },
    '@/features/learning/components/completion-reward': { CompletionReward: 'Reward' },
    '@/features/learning/utils/next-study': selection,
    '@/shared/hooks/use-today': { useToday: () => '2026-10-09' },
    '@/features/learning/hooks/use-learning': {
      useCurrentChild: () => child,
      useDailyPlan: (id, date) => {
        assert.equal(id, child.data?.id);
        assert.equal(date, '2026-10-09');
        return plan;
      },
      useDailyTasks: (id) => {
        assert.equal(id, plan.data?.id);
        return tasks;
      },
      useContinuingTasks: () => continuing,
      useStartDailyTask: () => mutation,
    },
  },
);
const render = (celebrate = true) =>
  StudyCompletionActions({ taskId: 'done', celebrate, status: 'CHILD_COMPLETED' });
const button = (label) =>
  nodes(render()).find((n) => n.type === 'Button' && n.props.label === label);
reset();
assert.ok(JSON.stringify(render()).includes('다음 문제집'));
assert.ok(!nodes(render()).some((n) => n.type === 'Reward'));
button('다음 공부 시작').props.onPress();
button('다음 공부 시작').props.onPress();
assert.deepEqual(calls, ['next'], 'Prevent repeat taps before React rerenders');
assert.deepEqual(routes, [], 'Wait for the server to accept starting the study');
mutation.isPending = true;
assert.equal(button('시작하고 있어요…').props.disabled, true);
assert.equal(button('공부 목록 보기').props.disabled, true);
callbacks.onSuccess();
assert.deepEqual(routes, [{ pathname: '/study/[taskId]', params: { taskId: 'next' } }]);
callbacks.onSettled();

reset([done, retry]);
button('다음 공부 시작').props.onPress();
assert.deepEqual(calls, ['retry']);
callbacks.onSettled();
mutation.isError = true;
assert.deepEqual(routes, [], 'Failure must leave the current completed study visible');
assert.ok(JSON.stringify(render()).includes('다음 공부를 시작하지 못했어요'));
button('다음 공부 시작').props.onPress();
assert.deepEqual(calls, ['retry', 'retry']);

reset([done, next], [past]);
button('다음 공부 이어하기').props.onPress();
assert.deepEqual(calls, [], 'Resuming an in-progress study must not call the start RPC');
assert.deepEqual(routes, [{ pathname: '/study/[taskId]', params: { taskId: 'past' } }]);
assert.ok(!nodes(render()).some((n) => n.type === 'Reward'));

reset([done]);
assert.ok(!button('다음 공부 시작'));
assert.ok(nodes(render()).some((n) => n.type === 'Reward'));
assert.ok(!nodes(render(false)).some((n) => n.type === 'Reward'), 'Do not celebrate on a reload');
button('내 컬렉션 보기').props.onPress();
button('공부 목록 보기').props.onPress();
assert.deepEqual(routes, ['/child/garden', '/child/today']);
assert.deepEqual(calls, [], 'Completion actions do not confirm tasks or award points');

reset([done, { ...next, quantity_conflict: 'GAP' }]);
assert.ok(JSON.stringify(render()).includes('부모님과 확인할 공부'));
assert.ok(!nodes(render()).some((n) => n.type === 'Reward'));
assert.ok(!button('다음 공부 시작'));

for (const name of ['tasks', 'continuing', 'child', 'plan']) {
  reset();
  const target = { tasks, continuing, child, plan }[name];
  target.isFetching = true;
  assert.ok(!button('다음 공부 시작'));
  assert.ok(!button('내 컬렉션 보기'), 'Never claim all done from a stale cache');
  assert.ok(button('공부 목록 보기'));
  target.isFetching = false;
  target.isError = true;
  assert.ok(!button('다음 공부 시작'));
  button('다시 불러오기').props.onPress();
  assert.deepEqual(refetches, ['child', 'plan', 'tasks', 'continuing']);
}
console.log(
  'PASS next study: ordering, exclusions, server success/failure, resume, repeated taps, loading/errors, list and collection actions, event-only celebration',
);
