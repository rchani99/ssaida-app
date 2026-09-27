import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import ts from 'typescript';

const jsx = (type, props) => ({ type, props });
function harness(file, extra) {
  const slots = [];
  let cursor = 0;
  const mocks = {
    react: {
      useState(initial) {
        const index = cursor++;
        if (!(index in slots)) slots[index] = initial;
        return [
          slots[index],
          (value) => {
            slots[index] = typeof value === 'function' ? value(slots[index]) : value;
          },
        ];
      },
      useRef(initial) {
        const index = cursor++;
        return (slots[index] ??= { current: initial });
      },
    },
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    'react-native': {
      View: 'View',
      Text: 'Text',
      Pressable: 'Pressable',
      ActivityIndicator: 'Spinner',
    },
    '@/features/learning/components/learning-controls': {
      LearningButton: 'Button',
      LearningField: 'Field',
      learningStyles: {},
    },
    '@/features/learning/components/parent-review-styles': { parentReviewStyles: {} },
    '@/features/learning/components/parent-review-actions': {
      ParentReviewActions: 'Options',
      ParentReviewConfirm: 'Confirm',
    },
    ...extra,
  };
  const module = { exports: {} };
  new Function(
    'require',
    'module',
    'exports',
    ts.transpileModule(
      readFileSync(new URL('../src/features/learning/components/' + file, import.meta.url), 'utf8'),
      { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } },
    ).outputText,
  )(
    (id) => {
      assert.ok(id in mocks, id);
      return mocks[id];
    },
    module,
    module.exports,
  );
  return (props) => {
    cursor = 0;
    return Object.values(module.exports)[0](props);
  };
}
function nodes(tree, type) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap((node) => nodes(node, type));
  return [...(tree.type === type ? [tree.props] : []), ...nodes(tree.props?.children, type)];
}
const task = {
  id: 'A',
  name_snapshot: '독서',
  status: 'PLANNED',
  item_type: 'ACTIVITY',
  planned_minutes: 20,
  daily_plans: { plan_date: '2026-09-23' },
};
const calls = [];
const mutation = (kind) => ({
  isPending: false,
  mutate: (input, callbacks) => {
    calls.push({ kind, input });
    callbacks.onSuccess?.();
    callbacks.onSettled?.();
  },
});
const renderManual = harness('manual-tasks-panel.tsx', {
  '@/shared/hooks/use-today': { useToday: () => '2026-09-23' },
  '@/features/learning/hooks/use-learning': {
    useDailyPlan: () => ({ data: null }),
    useDailyTasks: () => ({ data: [] }),
    useUnresolvedManualTasks: () => ({ data: [task, { ...task, id: 'B' }] }),
    useAddManualDailyTask: () => mutation('add'),
    useRescheduleManualTask: () => mutation('move'),
    useSkipManualTask: () => mutation('skip'),
  },
});
const manual = () =>
  renderManual({ childId: 'child', mode: 'unresolved', showList: true, reviewStyle: true });
assert.equal(nodes(manual(), 'Options')[0].actions[0].selected, true);
nodes(manual(), 'Options')[0].actions[1].onPress();
assert.equal(calls.length, 0);
assert.equal(nodes(manual(), 'Options')[1].actions[0].selected, true);
nodes(manual(), 'Confirm')[0].onPress();
assert.deepEqual(calls.pop(), { kind: 'skip', input: 'A' });
nodes(manual(), 'Options')[0].actions[0].onPress();
assert.equal(calls.length, 0);
nodes(manual(), 'Confirm')[0].onPress();
assert.deepEqual(calls.pop(), { kind: 'move', input: { taskId: 'A', date: '2026-09-23' } });
assert.equal(nodes(manual(), 'Button').length, 0);

for (const action of ['ADJUST', 'EXCLUDE']) {
  const proposal = {
    task_id: 'A',
    action,
    context_token: 'unchanged-server-token',
    old_start: 1,
    old_end: 5,
    new_start: 6,
    new_end: 10,
    confirmed_progress: 5,
  };
  let previewCount = 0;
  const resolved = [];
  const renderConflict = harness('quantity-conflict-resolution.tsx', {
    '@/features/learning/api/quantity-resolution-api': {
      QuantityResolutionError: class extends Error {},
    },
    '@/features/learning/utils/task-order': { seoulDate: () => '2026-09-23' },
    '@/features/learning/hooks/use-quantity-resolution': {
      usePreviewQuantityResolution: () => ({
        isPending: false,
        mutate: (id, cb) => {
          assert.equal(id, 'A');
          previewCount++;
          cb.onSuccess(proposal);
          cb.onSettled();
        },
      }),
      useResolveQuantityConflict: () => ({
        isPending: false,
        mutate: (input, cb) => {
          assert.equal(input, proposal);
          resolved.push(input);
          cb.onSuccess(input);
          cb.onSettled();
        },
      }),
    },
  });
  let result;
  const conflict = () =>
    renderConflict({
      task: {
        ...task,
        source_type: 'AUTO',
        item_type: 'WORKBOOK',
        started_at: null,
        quantity_conflict: true,
      },
      reviewStyle: true,
      onResolved: (value) => {
        result = value;
      },
    });
  assert.equal(nodes(conflict(), 'Confirm')[0].disabled, true);
  nodes(conflict(), 'Options')[0].actions[0].onPress();
  assert.equal(previewCount, 0);
  nodes(conflict(), 'Confirm')[0].onPress();
  assert.equal(previewCount, 1);
  assert.equal(nodes(conflict(), 'Confirm')[0].disabled, true);
  nodes(conflict(), 'Options')[0].actions[1].onPress();
  assert.equal(resolved.length, 0);
  nodes(conflict(), 'Confirm')[0].onPress();
  assert.equal(resolved.length, 0);
  nodes(conflict(), 'Options')[0].actions[0].onPress();
  nodes(conflict(), 'Confirm')[0].onPress();
  nodes(conflict(), 'Options')[0].actions[0].onPress();
  assert.equal(resolved.length, 0);
  nodes(conflict(), 'Confirm')[0].onPress();
  assert.equal(resolved.length, 1);
  assert.equal(result, proposal);
}
console.log(
  'PASS: manual move/skip, selection isolation, conflict preview/cancel/ADJUST/EXCLUDE payload preservation',
);
