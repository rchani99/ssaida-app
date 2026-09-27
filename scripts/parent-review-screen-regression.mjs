import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import ts from 'typescript';

import { uiMocks } from './ui-regression-mocks.mjs';

const jsx = (type, props) => ({ type, props });
const slots = [];
let cursor = 0,
  effects = [],
  params = {},
  route,
  query,
  tree,
  focusCleanup;
const react = {
  useState(value) {
    const i = cursor++;
    if (!(i in slots)) slots[i] = value;
    return [
      slots[i],
      (v) => {
        slots[i] = v;
      },
    ];
  },
  useRef(value) {
    const i = cursor++;
    return slots[i] ?? (slots[i] = { current: value });
  },
  useCallback(fn, deps) {
    const i = cursor++;
    if (!slots[i] || deps.some((v, j) => v !== slots[i].deps[j])) slots[i] = { fn, deps };
    return slots[i].fn;
  },
  useEffect(fn, deps) {
    const i = cursor++;
    if (!slots[i] || deps.some((v, j) => v !== slots[i][j])) {
      slots[i] = deps;
      effects.push(fn);
    }
  },
};
const router = {
  replace: (path) => {
    route = path;
  },
  setParams: (next) => {
    params = { ...params, ...next };
  },
};
const mocks = {
  react,
  'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
  'expo-router': {
    useRouter: () => router,
    useLocalSearchParams: () => params,
    useFocusEffect: (fn) =>
      react.useEffect(() => {
        focusCleanup = fn();
      }, [fn]),
  },
  'react-native': {
    View: 'View',
    Text: 'Text',
    Pressable: 'Pressable',
    ScrollView: 'ScrollView',
    KeyboardAvoidingView: 'Keyboard',
    Platform: { OS: 'android' },
  },
  'react-native-safe-area-context': { SafeAreaView: 'Safe' },
  '@/design-system/tokens': { colors: {}, spacing: {} },
  '@/features/learning/components/learning-controls': {
    LearningButton: 'Button',
    learningStyles: {},
  },
  '@/features/learning/components/parent-confirmation-panel': {
    ParentConfirmationPanel: 'Confirm',
  },
  '@/features/learning/components/manual-tasks-panel': { ManualTasksPanel: 'Manual' },
  '@/features/learning/hooks/use-learning': {
    useCurrentChild: () => ({ data: { id: 'child' } }),
    usePendingConfirmations: () => query,
  },
  '@/features/learning/hooks/use-seoul-today': { useSeoulToday: () => '2026-09-17' },
  '@/shared/components/screen-message': { ScreenMessage: 'Message' },
};
const mod = { exports: {} };
new Function(
  'require',
  'module',
  'exports',
  ts.transpileModule(
    readFileSync('src/features/learning/screens/parent-review-screen.tsx', 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } },
  ).outputText,
)(
  (id) => {
    Object.assign(mocks, uiMocks(mocks));
    assert.ok(id in mocks, id);
    return mocks[id];
  },
  mod,
  mod.exports,
);
const nodes = (n) =>
  !n || typeof n !== 'object' ? [] : [n, ...[n.props?.children].flat(Infinity).flatMap(nodes)];
function render() {
  cursor = 0;
  effects = [];
  tree = mod.exports.ParentReviewContent({ childId: 'child' });
  for (const fn of effects) fn();
  return tree;
}
const past = (id) => ({
  id,
  status: 'CHILD_COMPLETED',
  parent_verified_at: null,
  daily_plans: { plan_date: '2026-09-16' },
});
async function reset(nextParams, data = []) {
  slots.length = 0;
  params = nextParams;
  route = null;
  query = { data, isSuccess: true, isFetching: false, refetch: async () => ({ data: query.data }) };
  render();
  await new Promise((r) => setImmediate(r));
  render();
}
await reset({});
assert.equal(route, null, 'Normal dashboard entry never auto returns');
assert.equal(nodes(tree).find((n) => n.type === 'Confirm').props.section, 'pending');
for (const [tab, component, section] of [
  ['unresolved', 'Manual', undefined],
  ['conflicts', 'Confirm', 'conflicts'],
]) {
  params = { tab };
  render();
  assert.equal(nodes(tree).find((n) => n.type === component).props.section, section);
  assert.equal(nodes(tree).filter((n) => ['Manual', 'Confirm'].includes(n.type)).length, 1);
}
await reset({ returnTo: 'today-edit' }, [past('a'), past('b')]);
assert.equal(nodes(tree).find((n) => n.type === 'Confirm').props.beforeDate, '2026-09-17');
query.data = [past('b')];
render();
assert.equal(route, null);
query.data = [];
query.isFetching = true;
render();
assert.equal(route, null);
query.isFetching = false;
query.isSuccess = false;
render();
assert.equal(route, null);
query.isSuccess = true;
render();
assert.equal(route, '/parent-today-edit');
await reset({ returnTo: 'today-edit' }, [past('a')]);
nodes(tree)
  .find((n) => n.props?.label === '편집 진입 취소')
  .props.onPress();
query.data = [];
render();
assert.equal(route, '/parent/home', 'Cancel prevents return');
await reset({ returnTo: 'today-edit' }, [past('a')]);
focusCleanup();
query.data = [];
render();
assert.equal(route, null, 'Back/blur prevents return');
const root = readFileSync('src/app/_layout.tsx', 'utf8');
function loadComponent(path, imports) {
  const module = { exports: {} };
  new Function(
    'require',
    'module',
    'exports',
    ts.transpileModule(readFileSync(path, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    }).outputText,
  )(
    (id) => {
      Object.assign(mocks, uiMocks(mocks));
      assert.ok(id in imports, id);
      return imports[id];
    },
    module,
    module.exports,
  );
  return module.exports;
}
let mode = 'child';
params = { destination: 'parent-review' };
const index = loadComponent('src/app/index.tsx', {
  'react/jsx-runtime': mocks['react/jsx-runtime'],
  'expo-router': { Redirect: 'Redirect', useLocalSearchParams: () => params },
  '@/store/app-mode.store': { useAppModeStore: (select) => select({ mode }) },
}).default;
assert.equal(index().props.href, '/child/today');
mode = 'parent';
assert.equal(index().props.href, '/parent-review?tab=pending');
params = {};
assert.equal(index().props.href, '/parent/home');
let requestedPin = 0;
const routing = loadComponent('src/features/notifications/notification-routing.tsx', {
  react: { useEffect: (fn) => fn() },
  'expo-router': { useRootNavigationState: () => ({ key: 'root' }), useRouter: () => router },
  '@/features/auth/hooks/use-auth': { useAuth: () => ({ session: { user: { id: 'user' } } }) },
  '@/features/learning/hooks/use-learning': { useCurrentChild: () => ({ data: { id: 'child' } }) },
  '@/features/notifications/notification-context': {
    useNotifications: () => ({
      tap: { userId: 'user', childId: 'child', destination: 'parent' },
      clearTap() {},
      requestGate: () => {
        requestedPin++;
      },
    }),
  },
  '@/features/notifications/planner': {
    tapDestination: (_tap, _user, _child, value) => (value === 'parent' ? 'parent' : 'pin'),
  },
  '@/store/app-mode.store': { useAppModeStore: (select) => select({ mode }) },
}).NotificationRouting;
routing();
assert.equal(route, '/parent-review?tab=pending');
mode = 'child';
routing();
assert.equal(route, '/child/today');
assert.equal(requestedPin, 1);
console.log(
  'PASS notification routing: parent detail, child PIN gate, root redirect cannot bypass child mode',
);
assert.match(root, /Stack.Protected guard=\{mode === 'parent'\}[\s\S]*name="parent-review"/);
assert.match(
  readFileSync('src/app/parent-unresolved.tsx', 'utf8'),
  /parent-review\?tab=unresolved/,
);
console.log(
  'PASS parent review: tabs, past-only gate, partial/all, settled refresh, query error, cancel/back, normal entry, protected route and legacy redirect',
);
