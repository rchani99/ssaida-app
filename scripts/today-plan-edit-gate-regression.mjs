import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import ts from 'typescript';

import { uiMocks } from './ui-regression-mocks.mjs';

const slots = [];
let cursor = 0,
  effects = [],
  query,
  tree;
const jsx = (type, props) => ({ type, props });
const mocks = {
  react: {
    useCallback(fn, deps) {
      const i = cursor++;
      if (!slots[i] || deps.some((d, j) => !Object.is(d, slots[i].deps[j])))
        slots[i] = { fn, deps };
      return slots[i].fn;
    },
    useState(initial) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = initial;
      return [
        slots[i],
        (value) => {
          slots[i] = value;
        },
      ];
    },
    useRef(initial) {
      const i = cursor++;
      return slots[i] ?? (slots[i] = { current: initial });
    },
    useEffect(callback, deps) {
      const i = cursor++;
      if (!slots[i] || deps.some((d, j) => !Object.is(d, slots[i][j]))) {
        slots[i] = deps;
        effects.push(callback);
      }
    },
  },
  'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
  'react-native': { Text: 'Text', View: 'View', Pressable: 'Pressable' },
  '@/design-system/tokens': { spacing: { md: 16 } },
  '@/features/learning/components/learning-controls': {
    LearningButton: 'Button',
    learningStyles: {},
  },
  '@/features/learning/components/parent-confirmation-panel': {
    ParentConfirmationPanel: 'Confirm',
  },
  '@/features/learning/hooks/use-learning': { usePendingConfirmations: () => query },
  '@/features/learning/utils/task-order': { seoulDate: () => '2026-09-17' },
};
const module = { exports: {} };
new Function(
  'require',
  'module',
  'exports',
  ts.transpileModule(
    readFileSync('src/features/learning/components/today-plan-edit-gate.tsx', 'utf8'),
    {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    },
  ).outputText,
)(
  (id) => {
    Object.assign(mocks, uiMocks(mocks));
    assert.ok(id in mocks, id);
    return mocks[id];
  },
  module,
  module.exports,
);
const { TodayPlanEditGate } = module.exports;
let gateProps = {};
function render() {
  cursor = 0;
  effects = [];
  tree = TodayPlanEditGate({ childId: 'child', children: jsx('Editor', {}), ...gateProps });
  assert.deepEqual(tree.props.style, { gap: 16 }, 'No outer bordered panel');
  assert.ok(
    !nodes(tree).some((n) => n.type === 'Text' && n.props.children === '오늘 공부 편집'),
    'No duplicate body heading',
  );
  const pending = effects;
  for (const effect of pending) effect();
  {
    cursor = 0;
    effects = [];
    tree = TodayPlanEditGate({ childId: 'child', children: jsx('Editor', {}), ...gateProps });
  }
  return tree;
}
function nodes(node = tree) {
  if (!node || typeof node !== 'object') return [];
  return [node, ...[node.props?.children].flat(Infinity).filter(Boolean).flatMap(nodes)];
}
function has(type) {
  return nodes().some((n) => n.type === type);
}
async function press(label) {
  render();
  const button = nodes().find((n) => n.props?.label === label);
  assert.ok(button, label);
  button.props.onPress();
  await new Promise((resolve) => setImmediate(resolve));
  render();
}
const task = (id, date = '2026-09-16', status = 'CHILD_COMPLETED') => ({
  id,
  daily_plans: { plan_date: date },
  status,
  parent_verified_at: null,
});
function reset(data) {
  slots.length = 0;
  query = {
    data,
    isSuccess: true,
    isFetching: false,
    refetch: async () => ({ data: query.data, isError: false }),
  };
  render();
}
reset([task('today', '2026-09-17'), task('retry', '2026-09-16', 'RETRY')]);
await press('오늘 공부 편집');
assert.ok(has('Editor'), 'No past pending: enter directly');
await press('오늘 공부 편집 닫기');
assert.ok(!has('Editor'));
reset([task('a'), task('b')]);
await press('오늘 공부 편집');
assert.ok(!has('Editor'));
assert.match(JSON.stringify(tree), /먼저 확인할 공부가 있어요/);
assert.match(JSON.stringify(tree), /확인할 공부 /);
await press('지난 공부 확인하기');
assert.ok(has('Confirm'));
assert.equal(nodes().find((n) => n.type === 'Confirm').props.beforeDate, '2026-09-17');
query.data = [task('b')];
render();
assert.ok(!has('Editor'), 'Partial confirmation stays in review');
query.data = [];
query.isFetching = true;
render();
assert.ok(!has('Editor'), 'Wait for settled refresh');
query.isFetching = false;
query.isSuccess = false;
render();
assert.ok(!has('Editor'), 'Error cannot unlock');
query.isSuccess = true;
render();
assert.ok(has('Editor'), 'All confirmed: automatic return');
reset([task('a')]);
await press('오늘 공부 편집');
await press('지난 공부 확인하기');
await press('편집 진입 취소');
query.data = [];
render();
assert.ok(!has('Editor'), 'Cancel discards return intent');
reset([]);
query.refetch = async () => ({ data: [], isError: true });
await press('오늘 공부 편집');
assert.ok(!has('Editor'), 'Entry fetch error fails closed');
assert.match(JSON.stringify(tree), /다시 시도/);
query.refetch = async () => ({ data: [], isError: false });
await press('오늘 공부 편집');
assert.ok(has('Editor'), 'Retry recovers');
reset([]);
let resolve;
query.refetch = () =>
  new Promise((done) => {
    resolve = done;
  });
await press('오늘 공부 편집');
await press('편집 진입 취소');
resolve({ data: [], isError: false });
await new Promise((done) => setImmediate(done));
render();
assert.ok(!has('Editor'), 'Late response after cancel cannot open editor');
console.log(
  'PASS edit gate: past-only, fresh entry check, count, review, partial/all confirmation, automatic return, errors, cancellation',
);
let closed = 0;
gateProps = {
  autoStart: true,
  onClose: () => {
    closed++;
  },
};
reset([task('past')]);
await new Promise((done) => setImmediate(done));
render();
assert.ok(!has('Editor'), 'Direct entry checks past pending');
await press('지난 공부 확인하기');
query.data = [];
render();
assert.ok(has('Editor'), 'Direct entry automatically returns to requested editor');
await press('오늘 공부 편집 닫기');
assert.equal(closed, 1);
assert.ok(!has('Editor'), 'Auto start must not reopen after close');
console.log('PASS direct-route gate: auto check, review return, close without reopening');

// Exercise the actual existing confirmation component, not only the gate stub:
// the review flow must not accidentally batch-confirm today's pending tasks.
const confirmation = { exports: {} };
let submitted;
const confirmationMocks = {
  ...mocks,
  '@/features/learning/components/quantity-conflict-resolution': {
    QuantityConflictResolution: 'Resolution',
  },
  '@/features/learning/hooks/use-learning': {
    usePendingConfirmations: () => ({ data: [task('past'), task('today', '2026-09-17')] }),
    useStudyItems: () => ({ data: [] }),
    useReviewTasks: () => ({ data: [] }),
    useConfirmDailyTasks: () => ({
      mutate: (input) => {
        submitted = input;
      },
    }),
  },
  '@/features/learning/utils/exception-tasks': {
    buildConfirmations: (tasks) => tasks.map((t) => t.id),
    needsParentReminder: () => false,
    progressConflicts: () => [],
  },
};
new Function(
  'require',
  'module',
  'exports',
  ts.transpileModule(
    readFileSync('src/features/learning/components/parent-confirmation-panel.tsx', 'utf8'),
    {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    },
  ).outputText,
)(
  (id) => {
    Object.assign(mocks, uiMocks(mocks));
    Object.assign(confirmationMocks, uiMocks(confirmationMocks));
    assert.ok(id in confirmationMocks, id);
    return confirmationMocks[id];
  },
  confirmation,
  confirmation.exports,
);
slots.length = 0;
cursor = 0;
tree = confirmation.exports.ParentConfirmationPanel({ childId: 'child', beforeDate: '2026-09-17' });
nodes()
  .find((n) => n.type === 'Pressable' && n.props?.accessibilityLabel?.endsWith(' 확인'))
  .props.onPress();
assert.deepEqual(submitted, ['past']);
slots.length = 0;
cursor = 0;
tree = confirmation.exports.ParentConfirmationPanel({ childId: 'child' });
nodes()
  .find((n) => n.type === 'Pressable' && n.props?.accessibilityLabel?.endsWith(' 확인'))
  .props.onPress();
assert.deepEqual(submitted, ['past'], 'Normal confirmation submits only the clicked task');
console.log('PASS confirmation panel: past-only gate and per-task confirmation');
cursor = 0;
tree = confirmation.exports.ParentConfirmationPanel({ childId: 'child', section: 'conflicts' });
assert.ok(
  !nodes().some((n) => n.type === 'Pressable' && n.props?.accessibilityLabel?.endsWith(' 확인')),
);
assert.ok(nodes().some((n) => n.props?.children === '진도 충돌이 없어요.'));
cursor = 0;
tree = confirmation.exports.ParentConfirmationPanel({ childId: 'child', section: 'pending' });
assert.ok(
  nodes().some((n) => n.type === 'Pressable' && n.props?.accessibilityLabel?.endsWith(' 확인')),
);
assert.ok(!nodes().some((n) => n.type === 'Resolution'));
console.log('PASS panel section isolation: confirmations versus conflicts');
