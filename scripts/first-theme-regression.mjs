// Execute actual routes and handlers; native layout and Supabase writes are not mocked as verified.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import ts from 'typescript';

const jsx = (type, props) => ({ type, props });
const nodes = (tree) =>
  Array.isArray(tree)
    ? tree.flatMap(nodes)
    : tree && typeof tree === 'object'
      ? [tree, ...nodes(tree.props?.children)]
      : [];
const native = new Proxy({ StyleSheet: { create: (v) => v } }, { get: (o, k) => o[k] ?? k });
function load(path, imports = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  new Function('require', 'module', 'exports', code)(
    (id) => {
      assert.ok(id in imports, id);
      return imports[id];
    },
    module,
    module.exports,
  );
  return module.exports;
}
let child = {
  data: { id: 'child', selected_collection_theme_code: null, pending_growth_points: 12 },
};
let mode = 'child';
let selected = null;
let callbacks;
let saved = [];
let navigated = [];
const lock = { current: false };
const mutation = {
  isPending: false,
  isError: false,
  mutate: (code, cb) => {
    saved.push(code);
    callbacks = cb;
  },
};
const common = {
  'react/jsx-runtime': { jsx, jsxs: jsx },
  'react-native': native,
  'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
  '@/design-system/tokens': load('src/design-system/tokens.ts'),
  '@/shared/components/screen-message': { ScreenMessage: 'Message' },
  'expo-router': {
    Redirect: 'Redirect',
    Stack: { Screen: 'Screen' },
    useRouter: () => ({ replace: (path) => navigated.push(path) }),
    useLocalSearchParams: () => ({}),
  },
  '@/features/learning/hooks/use-learning': {
    useCurrentChild: () => child,
    useSelectCollectionTheme: () => mutation,
  },
};
const Index = load('src/app/index.tsx', {
  ...common,
  '@/store/app-mode.store': { useAppModeStore: (fn) => fn({ mode }) },
}).default;
assert.equal(
  Index().props.href,
  '/choose-theme',
  'Onboarding/relaunch without a theme enters the picker',
);
child.isLoading = true;
assert.equal(Index().type, 'Message');
child.isLoading = false;
child.isError = true;
assert.equal(Index().type, 'Message');
child.isError = false;
child.data.selected_collection_theme_code = 'DINO';
assert.equal(Index().props.href, '/child/today');
mode = 'parent';
child.data.selected_collection_theme_code = null;
assert.equal(Index().props.href, '/parent/home', 'Do not block parent management');

const { FirstThemePicker } = load('src/features/learning/components/first-theme-picker.tsx', {
  ...common,
  react: {
    useState: () => [
      selected,
      (value) => {
        selected = value;
      },
    ],
    useRef: () => lock,
  },
  '@/features/learning/components/collection-artwork': { CollectionArtwork: 'Artwork' },
  '@/features/learning/utils/collection-themes': load(
    'src/features/learning/utils/collection-themes.ts',
  ),
});
const render = () =>
  FirstThemePicker({ pendingPoints: 12, onSelected: () => navigated.push('/child/today') });
const submit = () => nodes(render()).find((n) => n.props.accessibilityRole === 'button');
assert.equal(submit().props.disabled, true);
assert.equal(nodes(render()).filter((n) => n.props.accessibilityRole === 'radio').length, 6);
assert.ok(JSON.stringify(render()).includes('남은 포인트도 그대로 보관돼요'));
nodes(render())
  .find((n) => n.props.accessibilityLabel === '공룡')
  .props.onPress();
assert.deepEqual(saved, [], 'Previewing a theme must not save or spend pending growth');
assert.ok(JSON.stringify(render()).includes('공룡과 시작하기'));
submit().props.onPress();
submit().props.onPress();
assert.deepEqual(saved, ['DINO'], 'Duplicate taps submit only once');
assert.deepEqual(navigated, [], 'Wait for the save');
mutation.isPending = true;
assert.equal(submit().props.disabled, true);
assert.ok(
  nodes(render())
    .filter((n) => n.props.accessibilityRole === 'radio')
    .every((n) => n.props.disabled),
);
mutation.isPending = false;
mutation.isError = true;
callbacks.onSettled();
assert.ok(nodes(render()).some((n) => n.props.accessibilityRole === 'alert'));
assert.deepEqual(navigated, []);
submit().props.onPress();
assert.deepEqual(saved, ['DINO', 'DINO']);
callbacks.onSuccess();
callbacks.onSettled();
assert.deepEqual(navigated, ['/child/today']);

const Choose = load('src/app/choose-theme.tsx', {
  ...common,
  '@/features/learning/components/first-theme-picker': { FirstThemePicker: 'Picker' },
}).default;
assert.equal(nodes(Choose()).find((n) => n.type === 'Picker').props.pendingPoints, 12);
child.data.selected_collection_theme_code = 'GEM';
assert.equal(
  Choose().props.href,
  '/child/today',
  'Back/re-entry cannot choose the first theme twice',
);

const { StudySessionScreen } = load('src/features/learning/screens/study-session-screen.tsx', {
  ...common,
  react: { useState: () => [null, () => {}] },
  '@/features/learning/components/learning-controls': { LearningButton: 'Button' },
  '@/features/learning/components/study-completion-actions': {
    StudyCompletionActions: 'Completed',
  },
  '@/features/learning/hooks/use-learning': {
    ...common['@/features/learning/hooks/use-learning'],
    useDailyTask: () => ({ data: { id: 'task', status: 'IN_PROGRESS' } }),
    useStartDailyTask: () => ({ mutate: () => assert.fail('Must not start') }),
    useCompleteDailyTask: () => ({ mutate: () => assert.fail('Must not complete') }),
  },
});
child.data.selected_collection_theme_code = null;
assert.equal(
  StudySessionScreen().props.href,
  '/choose-theme',
  'Direct study entry cannot bypass selection',
);
child.isError = true;
assert.equal(
  StudySessionScreen().type,
  'Message',
  'Failure must not be treated as a selected theme',
);
child.isError = false;
let starts = [];
const { ChildTodayScreen } = load('src/features/learning/screens/child-today-screen.tsx', {
  ...common,
  react: { useState: (v) => [v, () => {}], useRef: (v) => ({ current: v }), useEffect: () => {} },
  'expo-router': { useRouter: () => ({ push: (path) => navigated.push(path) }) },
  'lucide-react-native': {},
  '@/design-system/icons': { dashboardIconProps: {} },
  '@/features/learning/components/daily-study-celebration': {
    DailyStudyCelebration: 'Celebration',
  },
  '@/features/learning/components/rest-day-card': { RestDayCard: 'Rest' },
  '@/features/learning/components/today-collection-card': { TodayCollectionCard: 'CollectionCard' },
  '@/features/learning/utils/exception-tasks': { prioritizeTodayTasks: (v) => v },
  '@/features/learning/utils/visible-tasks': {
    groupTodayTasks: (today) => ({ today, continuing: [], todayCount: 1, remaining: 1 }),
  },
  '@/shared/hooks/use-today': { useToday: () => '2026-10-13' },
  '@/features/learning/hooks/use-learning': {
    ...common['@/features/learning/hooks/use-learning'],
    useStartDailyTask: () => ({
      mutate: (id, cb) => {
        starts.push(id);
        cb.onSuccess();
      },
    }),
    useEnsureDailyPlan: () => ({ mutate() {} }),
    useDailyPlan: () => ({ data: { id: 'plan' } }),
    useDailyTasks: () => ({ data: [{ id: 'task', status: 'PLANNED' }] }),
    useContinuingTasks: () => ({ data: [] }),
  },
});
navigated = [];
const startButton = () => nodes(ChildTodayScreen()).find((n) => n.type === 'Pressable');
startButton().props.onPress();
assert.deepEqual(starts, []);
assert.deepEqual(navigated, ['/choose-theme']);
assert.ok(nodes(ChildTodayScreen()).some((n) => n.type === 'CollectionCard'));
child.data.selected_collection_theme_code = 'DINO';
startButton().props.onPress();
assert.deepEqual(starts, ['task']);
assert.deepEqual(navigated.at(-1), { pathname: '/study/[taskId]', params: { taskId: 'task' } });
console.log(
  'PASS first theme: entry/loading/error, existing theme/parent access, six previews, pending notice, explicit save, duplicate guard, retry/success and direct study gate',
);
