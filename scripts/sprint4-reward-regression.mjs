// Production utilities/TSX with deterministic query/event mocks, not a native renderer.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import ts from 'typescript';

function load(path, imports = {}) {
  const module = { exports: {} };
  const output = ts.transpileModule(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  new Function('require', 'module', 'exports', output)(
    (id) => {
      assert.ok(id in imports, `Missing import ${id}`);
      return imports[id];
    },
    module,
    module.exports,
  );
  return module.exports;
}
const visible = load('src/features/learning/utils/visible-tasks.ts');
const rewardUtils = load('src/features/learning/utils/completion-reward.ts', {
  '@/features/learning/utils/visible-tasks': visible,
});
const { completionReward, growthStage } = rewardUtils;
const task = { id: 'last', status: 'CHILD_COMPLETED', growth_weight: 1, planned_minutes: 20 };
const prior = { ...task, id: 'prior', status: 'PARENT_CONFIRMED' };
assert.deepEqual(completionReward([prior, task], 'last'), { potentialPoints: 1 });
for (const status of ['PLANNED', 'IN_PROGRESS', 'RETRY']) {
  assert.equal(completionReward([task, { ...prior, status }], 'last'), null);
}
assert.equal(completionReward([], 'last'), null);
assert.equal(completionReward([task], 'yesterday-task'), null);
assert.equal(completionReward([{ ...task, status: 'IN_PROGRESS' }], 'last'), null);
for (const hidden of [
  { excluded_for_today: true },
  { quantity_conflict: 'GAP' },
  { status: 'SKIPPED' },
]) {
  assert.equal(
    completionReward([task, { ...prior, status: 'PLANNED', ...hidden }], 'last').potentialPoints,
    1,
  );
}
assert.equal(
  completionReward([task, { ...prior, status: 'PARTIAL', growth_weight: 1 }], 'last')
    .potentialPoints,
  1,
);
assert.equal(
  completionReward([task, { ...prior, status: 'CHILD_COMPLETED', growth_weight: 0.5 }], 'last')
    .potentialPoints,
  1.5,
);
assert.equal(completionReward([task, { ...prior, source_daily_task_id: 'last' }], 'last'), null);
for (const [points, stage] of [
  [0, 0],
  [2.49, 0],
  [2.5, 1],
  [5, 2],
  [7.5, 3],
  [9.99, 3],
]) {
  assert.equal(growthStage(points, 10, false).stage, stage);
}
assert.equal(growthStage(10, 10, true).stage, 4);
assert.equal(growthStage(0, 0, false).percent, 0);
assert.equal(growthStage(2, 4, false).percent, 50);
assert.equal(growthStage(2, 8, false).percent, 25);

const jsx = (type, props) => ({ type, props });
const native = new Proxy({ StyleSheet: { create: (x) => x } }, { get: (o, k) => o[k] ?? k });
const tokens = load('src/design-system/tokens.ts');
const common = {
  'react/jsx-runtime': { jsx, jsxs: jsx },
  'react-native': native,
  '@/design-system/tokens': tokens,
};
const { GrowthVisual } = load('src/features/learning/components/growth-visual.tsx', {
  ...common,
  '@/features/learning/utils/completion-reward': rewardUtils,
});
const visualNodes = (tree) =>
  Array.isArray(tree)
    ? tree.flatMap(visualNodes)
    : tree && typeof tree === 'object'
      ? [tree, ...visualNodes(tree.props?.children)]
      : [];
for (const points of [0, 3, 7]) {
  const view = GrowthVisual({ points, goal: 7, ready: points === 7 });
  const progress = visualNodes(view).find((node) => node.props.accessibilityRole === 'progressbar');
  assert.deepEqual(progress.props.accessibilityValue, { min: 0, max: 7, now: points });
  assert.ok(
    visualNodes(view).some(
      (node) => JSON.stringify(node.props.children) === JSON.stringify([points, ' / ', 7]),
    ),
  );
}
assert.ok(
  !JSON.stringify(GrowthVisual({ points: 1, goal: 4, ready: false, name: 'SECRET' })).includes(
    'SECRET',
  ),
);
assert.ok(
  JSON.stringify(GrowthVisual({ points: 4, goal: 4, ready: true })).includes('완성! 공개해보세요'),
);

let tasksQuery = { data: [task, prior] };
let route;
let reduced = true;
let animations = 0;
const effects = [];
const { CompletionReward } = load('src/features/learning/components/completion-reward.tsx', {
  ...common,
  react: { useState: (initial) => [initial()], useEffect: (effect) => effects.push(effect) },
  'expo-router': {
    useRouter: () => ({
      replace: (path) => {
        route = path;
      },
    }),
  },
  'react-native': {
    ...native,
    View: 'View',
    Text: 'Text',
    Animated: {
      Text: 'AnimatedText',
      Value: class {
        stopAnimation() {}
      },
      timing: () => ({}),
      sequence: () => ({
        start: () => {
          animations++;
        },
      }),
    },
    AccessibilityInfo: { isReduceMotionEnabled: async () => reduced },
  },
  '@/features/learning/components/learning-controls': { LearningButton: 'Button' },
  '@/features/learning/hooks/use-learning': {
    useCurrentChild: () => ({ data: { id: 'child' } }),
    useDailyPlan: (_child, date) => {
      assert.equal(date, '2026-09-27');
      return { data: { id: 'today' } };
    },
    useDailyTasks: () => tasksQuery,
  },
  '@/features/learning/utils/completion-reward': rewardUtils,
  '@/shared/hooks/use-today': { useToday: () => '2026-09-27' },
});
function nodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...nodes(tree.props?.children)];
}
const reward = CompletionReward({ taskId: 'last' });
const celebration = reward.type(reward.props);
assert.ok(JSON.stringify(celebration).includes('아직 확정 전이에요'));
nodes(celebration)
  .find((n) => n.type === 'Button')
  .props.onPress();
assert.equal(route, '/child/garden');
effects.pop()();
await new Promise((resolve) => setImmediate(resolve));
assert.equal(animations, 0);
reduced = false;
reward.type(reward.props);
effects.pop()();
await new Promise((resolve) => setImmediate(resolve));
assert.equal(animations, 1);
for (const state of [{ isFetching: true }, { isError: true }, { data: undefined }]) {
  tasksQuery = { data: [task], ...state };
  assert.equal(CompletionReward({ taskId: 'last' }), null);
}

// Execute the real session handler: a failure cannot unlock the reward, nor can a reload.
let stored = null;
let callbacks;
let status = 'IN_PROGRESS';
const { StudySessionScreen } = load('src/features/learning/screens/study-session-screen.tsx', {
  ...common,
  react: {
    useState: () => [
      stored,
      (value) => {
        stored = value;
      },
    ],
  },
  'expo-router': {
    Stack: { Screen: 'Screen' },
    useRouter: () => ({}),
    useLocalSearchParams: () => ({ taskId: 'last' }),
  },
  'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
  '@/features/learning/components/completion-reward': { CompletionReward: 'Reward' },
  '@/shared/components/screen-message': { ScreenMessage: 'Message' },
  '@/features/learning/hooks/use-learning': {
    useDailyTask: () => ({ data: { ...task, status } }),
    useStartDailyTask: () => ({}),
    useCompleteDailyTask: () => ({
      mutate: (_id, cb) => {
        callbacks = cb;
      },
    }),
  },
});
nodes(StudySessionScreen())
  .find((n) => n.type === 'Pressable')
  .props.onPress();
assert.equal(
  nodes(StudySessionScreen()).some((n) => n.type === 'Reward'),
  false,
);
callbacks.onSuccess();
status = 'CHILD_COMPLETED';
assert.equal(
  nodes(StudySessionScreen()).some((n) => n.type === 'Reward'),
  true,
);
stored = null;
assert.equal(
  nodes(StudySessionScreen()).some((n) => n.type === 'Reward'),
  false,
);
console.log(
  'PASS Sprint 4-3: last-only completion, honest potential points, exclusions, stages, hidden identity, CTA, reduced motion, success-only event and reload',
);
