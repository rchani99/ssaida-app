import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import ts from 'typescript';
const jsx = (type, props) => ({ type, props });
function load(file, mocks) {
  const module = { exports: {} };
  new Function(
    'require',
    'module',
    'exports',
    ts.transpileModule(readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    }).outputText,
  )(
    (id) => {
      assert.ok(id in mocks, id);
      return mocks[id];
    },
    module,
    module.exports,
  );
  return module.exports;
}
const rules = load('src/features/learning/utils/task-order.ts', {});
const date = rules.seoulDate();
let rows = [
  { id: 'retry', status: 'RETRY', sort_order: -1, started_at: null },
  { id: 'a', status: 'PLANNED', sort_order: 0, started_at: null },
  { id: 'b', status: 'PLANNED', sort_order: 1, started_at: null },
].map((task) => ({ ...task, updated_at: 'old', name_snapshot: task.id }));
let slots = [],
  cursor = 0,
  pending;
const calls = [];
const native = { View: 'View', Text: 'Text', AppState: {} };
const react = {
  useState(initial) {
    const i = cursor++;
    if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial;
    return [
      slots[i],
      (v) => {
        slots[i] = typeof v === 'function' ? v(slots[i]) : v;
      },
    ];
  },
  useRef(initial) {
    const i = cursor++;
    return (slots[i] ??= { current: initial });
  },
  useEffect() {},
  useCallback: (fn) => fn,
};
class TaskOrderError extends Error {}
const { TaskOrderPanel } = load('src/features/learning/components/task-order-panel.tsx', {
  react,
  'react-native': native,
  'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
  '@/features/learning/api/learning-api': { TaskOrderError },
  '@/features/learning/components/learning-controls': {
    LearningButton: 'Button',
    learningStyles: {},
  },
  '@/features/learning/components/task-drag-list': { TaskDragList: 'Drag' },
  '@/features/learning/components/parent-review-styles': { parentReviewStyles: {} },
  '@/features/learning/utils/task-order': rules,
  '@/features/learning/hooks/use-learning': {
    useDailyPlan: () => ({
      data: { id: 'plan', plan_date: date },
      refetch: async () => ({ data: { id: 'plan' } }),
    }),
    useDailyTasks: () => ({ data: rows, refetch: async () => ({ data: rows }) }),
    useReorderDailyTasks: () => ({
      isPending: false,
      mutate: (input, cb) => {
        calls.push(input);
        pending = cb;
      },
    }),
  },
});
function nodes(tree, type) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap((t) => nodes(t, type));
  return [...(tree.type === type ? [tree.props] : []), ...nodes(tree.props?.children, type)];
}
const render = () => {
  cursor = 0;
  return TaskOrderPanel({ childId: 'child', editStyle: true });
};
const drag = () => nodes(render(), 'Drag')[0];
const ids = () => drag().tasks.map((t) => t.id);
const settle = () => new Promise((resolve) => setImmediate(resolve));
assert.deepEqual(drag().draggableIds, ['a', 'b']);
drag().onDragStateChange(true);
assert.equal(calls.length, 0);
drag().onMove(1, 1);
assert.equal(calls.length, 0);
drag().onMove(1, 2);
assert.equal(calls.length, 1);
assert.deepEqual(
  calls[0].tasks.map((t) => t.id),
  ['b', 'a'],
);
assert.deepEqual(ids(), ['retry', 'b', 'a']);
drag().onMove(2, 1);
assert.equal(calls.length, 1);
pending.onError(new Error('network'));
assert.deepEqual(ids(), ['retry', 'a', 'b']);
await settle();
drag().onDragStateChange(true);
drag().onMove(1, 2);
rows = [
  rows[0],
  { ...rows[2], sort_order: 0, updated_at: 'new' },
  { ...rows[1], sort_order: 1, updated_at: 'new' },
];
pending.onSuccess();
await settle();
assert.deepEqual(ids(), ['retry', 'b', 'a']);
slots = []; // Fresh mount reads the saved server response.
assert.deepEqual(ids(), ['retry', 'b', 'a']);
drag().onDragStateChange(true);
rows = rows.map((t) => (t.id === 'a' ? { ...t, updated_at: 'changed' } : t));
drag().onMove(1, 2);
assert.equal(calls.length, 2);
console.log(
  'PASS UI: drop-only save, no-op, duplicate guard, optimistic order, failure rollback, refetch/remount, stale guard, RETRY priority',
);
const sql = readFileSync('supabase/tests/sprint_2_reorder.sql', 'utf8');
const { TaskDragList } = load('src/features/learning/components/task-drag-list.tsx', {
  react,
  'react-native': { ...native, StyleSheet: { create: (styles) => styles } },
  'react/jsx-runtime': { jsx, jsxs: jsx },
  'lucide-react-native': { GripVertical: 'GripVertical' },
  '@/design-system/icons': { dashboardIconProps: {} },
  '@/design-system/tokens': {
    dashboardTokens: {
      spacing: { 8: 8, 12: 12 },
      border: { card: {} },
      radius: { normal: 18 },
      colors: {},
      typography: { cardTitle: {}, caption: {} },
      icon: { touchMin: 48 },
    },
  },
});
function handles(showHint, draggableIds) {
  slots = [];
  cursor = 0;
  const tree = TaskDragList({
    tasks: rows,
    draggableIds,
    showHint,
    disabled: false,
    onMove() {},
    onDragStateChange() {},
  });
  return tree.props.children[1].map((row) => row.props.children.props.draggable);
}
assert.deepEqual(handles(false, ['a', 'b']), [false, true, true]);
assert.deepEqual(handles(true, ['a', 'b']), [false, true, true]);
assert.deepEqual(handles(false, ['a']), [false, false, false]);
console.log(
  'PASS UI: hiding guidance preserves eligible drag handles; single item and RETRY stay locked',
);
if (process.argv.includes('--ui-only')) {
  console.log('SKIP DB: --ui-only');
  process.exit(0);
}
try {
  execFileSync('docker', ['inspect', '-f', '{{.State.Running}}', 'supabase_db_ssaida-app'], {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
} catch {
  console.log('DB NOT RUN: local Docker unavailable');
  process.exit(0);
}
execFileSync(
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
    '-v',
    'ON_ERROR_STOP=1',
  ],
  { input: sql, encoding: 'utf8', timeout: 60000 },
);
console.log('PASS DB: reorder RPC persistence and existing policy (fixtures rolled back)');
