import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import ts from 'typescript';

const jsx = (type, props) => ({ type, props });
const common = {
  react: { useState: (v) => [v, () => {}] },
  'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
  'react-native': {
    Text: 'Text',
    View: 'View',
    Pressable: 'Pressable',
    StyleSheet: { create: (v) => v },
  },
  '@/design-system/tokens': { colors: {}, radius: {}, sizing: {}, spacing: {} },
  '@/shared/components/screen-message': { ScreenMessage: 'Message' },
  'expo-router': {
    useRouter: () => ({ replace() {} }),
    useLocalSearchParams: () => ({ taskId: 'task' }),
  },
  '@/shared/hooks/use-today': {},
  '@/features/learning/utils/visible-tasks': {},
  'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
};
function load(path, mocks = {}, expose = false) {
  let source = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  if (expose) source = source.replace('function TaskCard(', 'export function TaskCard(');
  const module = { exports: {} };
  new Function(
    'require',
    'module',
    'exports',
    ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    }).outputText,
  )(
    (id) => {
      if (!(id in mocks)) throw new Error(id);
      return mocks[id];
    },
    module,
    module.exports,
  );
  return module.exports;
}
const rules = load('src/features/learning/utils/exception-tasks.ts');
const nodes = (t) =>
  !t || typeof t !== 'object'
    ? []
    : Array.isArray(t)
      ? t.flatMap(nodes)
      : [t, ...nodes(t.props?.children)];
let task;
let rpcCalls = 0;
const hooks = {
  useStartDailyTask: () => ({ mutate: () => rpcCalls++ }),
  useCompleteDailyTask: () => ({ mutate: () => rpcCalls++ }),
  useDailyTask: () => ({ data: task }),
  usePendingConfirmations: () => ({ data: [] }),
  useReviewTasks: () => ({ data: [task] }),
  useStudyItems: () => ({ data: [] }),
  useConfirmDailyTasks: () => ({}),
};
const mocks = {
  ...common,
  '@/features/learning/hooks/use-learning': hooks,
  '@/features/learning/utils/exception-tasks': rules,
  '@/features/learning/components/learning-controls': {
    LearningButton: 'Button',
    LearningField: 'Field',
    learningStyles: {},
  },
};
const card = load('src/features/learning/screens/child-today-screen.tsx', mocks, true);
const session = load('src/features/learning/screens/study-session-screen.tsx', mocks);
const parent = load('src/features/learning/components/parent-confirmation-panel.tsx', mocks);
for (const conflict of ['GAP', 'PARTIAL_OVERLAP', 'FULL_OVERLAP']) {
  for (const status of ['PLANNED', 'IN_PROGRESS', 'CHILD_COMPLETED', 'RETRY']) {
    task = {
      id: 'task',
      name_snapshot: 'Book',
      item_type: 'WORKBOOK',
      source_type: 'AUTO',
      study_item_id: 'book',
      status,
      planned_start_page: 95,
      planned_end_page: 99,
      planned_minutes: 20,
      quantity_conflict: conflict,
      daily_plans: { plan_date: '2026-09-16' },
    };
    assert.equal(rules.progressConflicts([task], []).length, 1);
    assert.throws(() => rules.buildConfirmations([task], {}, []), /진도 변경/);
    const tree = card.TaskCard({
      task,
      onOpen: () => {
        throw new Error('Conflict opened');
      },
    });
    assert.ok(!nodes(tree).some((n) => n.type === 'Pressable'));
    assert.ok(
      nodes(tree).some(
        (n) => n.props?.children === '진도가 바뀌었어요. 부모님과 다시 확인해 주세요.',
      ),
    );
    assert.equal(
      session.StudySessionScreen().props.message,
      '진도가 바뀌었어요. 부모님과 다시 확인해 주세요.',
    );
    assert.ok(
      nodes(parent.ParentConfirmationPanel({ childId: 'child' })).some(
        (n) => n.props?.children === '진도 변경으로 다시 확인이 필요해요',
      ),
    );
  }
}
assert.equal(rpcCalls, 0);
task = { ...task, status: 'PLANNED', quantity_conflict: null };
assert.ok(nodes(card.TaskCard({ task, onOpen() {} })).some((n) => n.type === 'Pressable'));
task = { ...task, item_type: 'ACTIVITY', study_item_id: null };
assert.ok(nodes(card.TaskCard({ task, onOpen() {} })).some((n) => n.type === 'Pressable'));
console.log(
  'PASS conflict UI: parent alerts, child no CTA, deep-link blocked, confirmation blocked; normal workbook/activity remain usable',
);
