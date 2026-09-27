import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import ts from 'typescript';

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
      assert.ok(id in mocks, `Missing mock: ${id}`);
      return mocks[id];
    },
    module,
    module.exports,
    false,
  );
  return module.exports;
}
const jsx = (type, props) => ({ type, props });
const native = {
  StyleSheet: { create: (v) => v },
  View: 'View',
  Text: 'Text',
  Pressable: 'Pressable',
};
const tokens = load('src/design-system/tokens.ts');
const rules = load('src/features/learning/utils/exception-tasks.ts');
const styles = load('src/features/learning/components/parent-review-styles.ts', {
  'react-native': native,
  '@/design-system/tokens': tokens,
});
const slots = [];
let cursor = 0;
const react = {
  useState(initial) {
    const i = cursor++;
    if (!(i in slots)) slots[i] = initial;
    return [
      slots[i],
      (value) => {
        slots[i] = typeof value === 'function' ? value(slots[i]) : value;
      },
    ];
  },
  useRef(initial) {
    const i = cursor++;
    return slots[i] ?? (slots[i] = { current: initial });
  },
};
const task = (id) => ({
  id,
  name_snapshot: id,
  item_type: 'WORKBOOK',
  study_item_id: 'book',
  status: 'CHILD_COMPLETED',
  planned_start_page: 28,
  planned_end_page: 33,
  parent_verified_at: null,
  daily_plans: { plan_date: '2026-09-17' },
});
let pending = [task('A'), task('B')];
let call;
let busy = false;
let calls = 0;
const { ParentConfirmationPanel } = load(
  'src/features/learning/components/parent-confirmation-panel.tsx',
  {
    react,
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    'react-native': native,
    '@/design-system/tokens': tokens,
    '@/features/learning/components/parent-review-styles': styles,
    '@/features/learning/components/learning-controls': {
      learningStyles: {},
      LearningButton: 'Button',
      LearningField: 'Field',
    },
    '@/features/learning/components/quantity-conflict-resolution': {
      QuantityConflictResolution: 'Resolution',
    },
    '@/features/learning/utils/exception-tasks': rules,
    '@/features/learning/hooks/use-learning': {
      usePendingConfirmations: () => ({ data: pending }),
      useStudyItems: () => ({ data: [{ id: 'book', workbook_last_page: 100 }] }),
      useReviewTasks: () => ({ data: [] }),
      useConfirmDailyTasks: () => ({
        isPending: busy,
        mutate: (input, callbacks) => {
          calls++;
          call = { input, callbacks };
        },
      }),
    },
  },
);
const nodes = (tree) =>
  !tree || typeof tree !== 'object'
    ? []
    : Array.isArray(tree)
      ? tree.flatMap(nodes)
      : [tree, ...nodes(tree.props?.children)];
const render = () => {
  cursor = 0;
  return nodes(ParentConfirmationPanel({ childId: 'c', section: 'pending', reviewStyle: true }));
};
const confirm = (tree, name) => tree.find((n) => n.props?.accessibilityLabel === `${name} 확인`);
let tree = render();
assert.ok(!tree.some((n) => n.props?.accessibilityRole === 'checkbox'));
assert.ok(!tree.some((n) => n.props?.label === '선택한 공부 확인하기'));
assert.equal(
  tree.filter((n) => n.type === 'Field' && n.props.label === '몇 쪽까지 했나요?').length,
  2,
);
// Another row's invalid draft must neither block A nor get discarded by A's success.
tree.find((n) => n.props?.accessibilityLabel === 'B 조금만').props.onPress();
tree = render();
tree.filter((n) => n.type === 'Field')[1].props.onChangeText('');
tree = render();
const clickA = confirm(tree, 'A').props.onPress;
clickA();
clickA();
assert.equal(calls, 1, 'Duplicate press is blocked even before a re-render');
assert.deepEqual(call.input, [{ dailyTaskId: 'A', status: 'PARENT_CONFIRMED', actualEndPage: 33 }]);
busy = true;
assert.equal(confirm(render(), 'B').props.disabled, true);
pending = pending.filter((t) => t.id !== 'A');
call.callbacks.onSuccess();
call.callbacks.onSettled();
busy = false;
tree = render();
assert.equal(confirm(tree, 'A'), undefined);
assert.ok(confirm(tree, 'B'));
assert.equal(tree.find((n) => n.type === 'Field').props.value, '');
confirm(tree, 'B').props.onPress();
assert.equal(calls, 1, 'Invalid partial page does not call API');
tree.find((n) => n.type === 'Field').props.onChangeText('30');
confirm(render(), 'B').props.onPress();
assert.deepEqual(call.input, [{ dailyTaskId: 'B', status: 'PARTIAL', actualEndPage: 30 }]);
call.callbacks.onError();
call.callbacks.onSettled();
tree = render();
assert.ok(confirm(tree, 'B'), 'Failure leaves row available');
tree.find((n) => n.props?.accessibilityLabel === 'B 다시').props.onPress();
tree = render();
assert.ok(!tree.some((n) => n.type === 'Field'));
confirm(tree, 'B').props.onPress();
assert.deepEqual(call.input, [{ dailyTaskId: 'B', status: 'RETRY', actualEndPage: null }]);
let rpc;
const api = load('src/features/learning/api/learning-api.ts', {
  '@/features/learning/utils/exception-tasks': rules,
  '@/lib/supabase/client': {
    getSupabaseClient: () => ({
      rpc: async (name, payload) => {
        rpc = { name, payload };
        return { error: null };
      },
    }),
  },
});
await api.confirmDailyTasks(call.input);
assert.deepEqual(rpc, {
  name: 'confirm_daily_tasks',
  payload: { task_confirmations: [{ daily_task_id: 'B', status: 'RETRY', actual_end_page: null }] },
});
console.log(
  'PASS production UI/API: only clicked task submitted, other draft retained, double press blocked, partial validation, error retry and RETRY payload',
);

for (const file of [
  'parent_single_confirmation.sql',
  'sprint_1_planning_override.sql',
  'sprint_2_quantity.sql',
]) {
  const sql = readFileSync(new URL(`../supabase/tests/${file}`, import.meta.url), 'utf8');
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
  console.log(`PASS local DB (rolled back): ${file}`);
}
