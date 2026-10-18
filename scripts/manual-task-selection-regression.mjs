import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import ts from 'typescript';

// Exercise production handlers with deterministic state and query fixtures.
const slots = [];
let cursor = 0;
const jsx = (type, props) => ({ type, props });
const workbook = {
  id: 'book',
  child_id: 'child',
  item_type: 'WORKBOOK',
  name: '수학 문제집',
  subject: 'MATH',
  estimated_minutes: 25,
  status: 'ACTIVE',
  workbook_last_completed_page: 92,
  workbook_last_page: 100,
  workbook_pages_per_session: 5,
  workbook_next_start_page_override: 98,
};
const activity = {
  ...workbook,
  id: 'activity',
  item_type: 'ACTIVITY',
  name: '독서',
  subject: 'KOREAN',
  estimated_minutes: 15,
  status: 'PAUSED',
};
let refetches = 0;
const query = {
  data: [
    workbook,
    activity,
    {
      ...workbook,
      id: 'review',
      name: '완료한 문제집',
      status: 'COMPLETED',
      workbook_last_completed_page: 100,
      workbook_next_start_page_override: null,
    },
    { ...workbook, id: 'deleted', status: 'DELETED', name: '삭제한 공부' },
    { ...workbook, id: 'other-child', child_id: 'another-child', name: '다른 아이 공부' },
  ],
  refetch: () => {
    refetches++;
  },
};
let pending = false;
let input;
let callbacks;
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
  '@/features/learning/components/parent-review-actions': {},
  '@/features/learning/components/parent-review-styles': { parentReviewStyles: {} },
  '@/shared/hooks/use-today': { useToday: () => '2026-10-13' },
  '@/features/learning/hooks/use-learning': {
    useDailyPlan: () => ({ data: { id: 'plan', target_minutes_snapshot: 60 } }),
    useDailyTasks: () => ({ data: [] }),
    useUnresolvedManualTasks: () => ({ data: [] }),
    useStudyItems: () => query,
    useAddManualDailyTask: () => ({
      isPending: pending,
      mutate(value, options) {
        input = value;
        callbacks = options;
      },
    }),
    useRescheduleManualTask: () => ({}),
    useSkipManualTask: () => ({}),
  },
};
const module = { exports: {} };
new Function(
  'require',
  'module',
  'exports',
  ts.transpileModule(
    readFileSync(
      new URL('../src/features/learning/components/manual-tasks-panel.tsx', import.meta.url),
      'utf8',
    ),
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
const render = () => {
  cursor = 0;
  return module.exports.ManualTasksPanel({ childId: 'child', mode: 'add', reviewStyle: true });
};
function nodes(tree = render()) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap((child) => nodes(child ?? null));
  return [tree, ...nodes(tree.props?.children ?? null)];
}
const control = (label) =>
  nodes().find(
    (n) =>
      n.props?.label === label ||
      n.props?.accessibilityLabel === label ||
      (n.type === 'Pressable' && n.props.children?.props?.children === label),
  )?.props;
const press = (label) => {
  assert.ok(control(label), label);
  control(label).onPress();
};
const value = (label) => control(label).value;
const finish = () => {
  callbacks.onSuccess();
  callbacks.onSettled();
};

press('+ 오늘 할 일 추가');
assert.ok(control('등록한 공부 수학 문제집'));
assert.equal(control('등록한 공부 독서'), undefined);
assert.equal(control('등록한 공부 삭제한 공부'), undefined);
assert.equal(control('등록한 공부 다른 아이 공부'), undefined);
assert.equal(control('오늘 할 일 저장'), undefined);
press('등록한 공부 수학 문제집');
assert.equal(value('오늘 할 일 이름'), '수학 문제집');
assert.equal(value('오늘 할 일 예상시간 (분)'), '25');
assert.equal(value('오늘 할 일 시작 쪽'), '98');
assert.equal(value('오늘 할 일 마지막 쪽'), '100');
assert.equal(control('오늘 할 일 과목 수학').accessibilityState.selected, true);
control('오늘 할 일 시작 쪽').onChangeText('101');
press('오늘 할 일 저장');
assert.equal(input, undefined, 'Invalid page ranges cannot be saved');
control('오늘 할 일 시작 쪽').onChangeText('99');
control('오늘 할 일 예상시간 (분)').onChangeText('10');
pending = true;
assert.equal(control('등록한 공부 완료한 문제집').disabled, true);
assert.equal(control('오늘 할 일 저장').disabled, true);
pending = false;
press('오늘 할 일 저장');
assert.deepEqual(input, {
  childId: 'child',
  planDate: '2026-10-13',
  itemType: 'WORKBOOK',
  name: '수학 문제집',
  subject: 'MATH',
  minutes: 10,
  startPage: 99,
  endPage: 100,
});
finish();
press('+ 오늘 할 일 추가');
assert.equal(control('오늘 할 일 저장'), undefined, 'Selection resets after saving');
press('등록한 공부 완료한 문제집');
assert.equal(value('오늘 할 일 시작 쪽'), '1');
assert.equal(value('오늘 할 일 마지막 쪽'), '5');
press('오늘 할 일 활동');
assert.equal(control('오늘 할 일 저장'), undefined, 'Changing type clears selection');
press('등록한 공부 독서');
assert.equal(value('오늘 할 일 예상시간 (분)'), '15');
assert.equal(control('오늘 할 일 시작 쪽'), undefined);
press('오늘 할 일 저장');
assert.equal(input.name, '독서');
assert.equal(input.startPage, null);
assert.equal(input.endPage, null);
finish();
press('+ 오늘 할 일 추가');
workbook.workbook_next_start_page_override = null;
press('등록한 공부 수학 문제집');
assert.equal(value('오늘 할 일 시작 쪽'), '93');
assert.equal(value('오늘 할 일 마지막 쪽'), '97');
press('직접 입력');
assert.equal(value('오늘 할 일 이름'), '');
control('오늘 할 일 이름').onChangeText('새 숙제');
press('오늘 할 일 저장');
assert.equal(input.name, '새 숙제');
finish();
press('+ 오늘 할 일 추가');
query.isLoading = true;
assert.ok(nodes().some((n) => n.type === 'Spinner'));
query.isLoading = false;
query.isError = true;
press('등록한 공부 다시 불러오기');
assert.equal(refetches, 1);
assert.equal(control('오늘 할 일 저장'), undefined);
query.isError = false;
query.data = [];
assert.ok(
  nodes().some(
    (n) => n.type === 'Text' && JSON.stringify(n.props.children).includes('직접 입력으로'),
  ),
);
press('직접 입력');
assert.ok(control('오늘 할 일 저장'), 'Manual entry remains available without registered items');
console.log(
  'PASS registered workbook/activity selection, defaults, edits, payloads, reset, loading/error/empty states',
);
