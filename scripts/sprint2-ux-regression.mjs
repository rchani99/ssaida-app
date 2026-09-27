import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import ts from 'typescript';

import { uiMocks } from './ui-regression-mocks.mjs';

function load(path, mocks, exposeRow = false) {
  let source = readFileSync(new URL('../' + path, import.meta.url), 'utf8');
  if (exposeRow) source = source.replace('function DragRow(', 'export function DragRow(');
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
      mocks = uiMocks(mocks);
      assert.ok(id in mocks, id);
      return mocks[id];
    },
    module,
    module.exports,
  );
  return module.exports;
}
const jsx = (type, props) => ({ type, props });
const tokens = load('src/design-system/tokens.ts', {});
const base = {
  'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
  '@/design-system/tokens': tokens,
  'react-native': {
    View: 'View',
    Text: 'Text',
    Pressable: 'Pressable',
    StyleSheet: { create: (v) => v },
    PanResponder: { create: (callbacks) => ({ panHandlers: callbacks }) },
    useWindowDimensions: () => ({ fontScale: 1 }),
  },
};
let mode = 'parent',
  route;
const button = load('src/features/auth/components/child-mode-button.tsx', {
  ...base,
  'lucide-react-native': { ChevronRight: 'ChevronRight' },
  '@/design-system/icons': { dashboardIconProps: {} },
  'expo-router': {
    useRouter: () => ({
      replace: (path) => {
        route = path;
      },
    }),
  },
  '@/store/app-mode.store': {
    useAppModeStore: (selector) =>
      selector({
        setMode: (value) => {
          mode = value;
        },
      }),
  },
});
const Tabs = Object.assign(() => {}, { Screen: 'Screen' });
const layout = load('src/app/parent/_layout.tsx', {
  ...base,
  'lucide-react-native': {
    House: 'House',
    ClipboardList: 'ClipboardList',
    ChartColumn: 'ChartColumn',
    Settings: 'Settings',
  },
  '@/design-system/icons': { dashboardIconProps: {} },
  'expo-router': { Tabs },
  '@/features/auth/components/child-mode-button': button,
}).default();
assert.deepEqual(
  layout.props.children.map((c) => c.props.name),
  ['home', 'study-management', 'records', 'settings'],
);
for (const screen of layout.props.children) {
  const right = (screen.props.options.headerRight ?? layout.props.screenOptions.headerRight)();
  const control = right.type();
  assert.equal(control.props.accessibilityLabel, '아이 화면');
  mode = 'parent';
  route = undefined;
  control.props.onPress();
  assert.equal(mode, 'child');
  assert.equal(route, '/');
}
console.log(
  'PASS common header: dashboard/management/records/settings expose child-mode action with unchanged routing',
);

const slots = [];
let cursor = 0;
let effects = [];
const react = {
  useLayoutEffect: (callback) => callback(),
  useRef(value) {
    const i = cursor++;
    return slots[i] ?? (slots[i] = { current: value });
  },
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
  useMemo: (fn) => fn(),
  useEffect: (fn) => effects.push(fn),
};
const drag = load('src/features/learning/components/task-drag-list.tsx', { ...base, react }, true);
const transitions = [],
  moves = [];
let props = {
  task: { id: 'a', name_snapshot: 'A' },
  index: 1,
  indexes: [0, 1, 2, 3],
  draggable: true,
  target: (index, distance) => drag.dragTarget(index, distance, 88, 4),
  disabled: false,
  onMove: (from, to) => moves.push([from, to]),
  onDragStateChange: (value) => transitions.push(value),
};
const nodes = (t) =>
  !t || typeof t !== 'object'
    ? []
    : Array.isArray(t)
      ? t.flatMap(nodes)
      : [t, ...nodes(t.props?.children)];
const render = () => {
  cursor = 0;
  effects = [];
  return drag.DragRow(props);
};
const handle = () => nodes(render()).find((n) => n.props?.accessibilityRole === 'adjustable').props;
assert.equal(handle().onStartShouldSetPanResponder(), true);
handle().onPanResponderGrant();
handle().onPanResponderMove({}, { dy: 180 });
assert.equal(
  render().props.style.at(-1).transform[0].translateY,
  180,
  'gesture displacement follows pointer',
);
handle().onPanResponderRelease({}, { dy: 180 });
assert.deepEqual(moves, [[1, 3]]);
assert.deepEqual(transitions, [true, false]);
handle().onPanResponderGrant();
handle().onPanResponderMove({}, { dy: -999 });
assert.equal(
  render().props.style.at(-1).transform[0].translateY,
  -999,
  'gesture displacement follows pointer',
);
handle().onPanResponderTerminate();
assert.equal(moves.length, 1, 'cancel must not reorder');
handle().onPanResponderGrant();
props = { ...props, disabled: true };
handle().onPanResponderRelease({}, { dy: 88 });
assert.equal(moves.length, 1, 'stale update during drag rejected');
assert.equal(handle().onStartShouldSetPanResponder(), false);
props = { ...props, disabled: false };
handle().onAccessibilityAction({ nativeEvent: { actionName: 'decrement' } });
assert.deepEqual(moves.at(-1), [1, 0]);
handle().onPanResponderGrant();
render();
const cleanup = effects[1]();
cleanup();
assert.equal(transitions.at(-1), false, 'unmount releases parent scroll lock');
assert.equal(drag.dragTarget(0, -100, 88, 4), 0);
assert.equal(drag.dragTarget(3, 100, 88, 4), 3);
console.log(
  'PASS real drag handlers: handle activation, displacement/drop, bounds, cancel, stale guard, accessibility, scroll release',
);

const home = load('src/features/learning/screens/parent-home-screen.tsx', {
  ...base,
  'expo-router': {
    useRouter: () => ({
      push: (path) => {
        route = path;
      },
    }),
  },
  'react-native': {
    ...base['react-native'],
    ScrollView: 'ScrollView',
    Platform: { OS: 'android' },
  },
  '@/features/learning/components/learning-controls': { LearningButton: 'Button' },
  '@/features/learning/components/today-plan-summary': { TodayPlanSummary: 'Summary' },
  '@/features/learning/components/parent-review-links': { ParentReviewLinks: 'ReviewLinks' },
  '@/features/learning/components/unresolved-manual-button': {
    UnresolvedManualButton: 'PastButton',
  },
  '@/features/learning/components/parent-confirmation-panel': {
    ParentConfirmationPanel: 'Confirm',
  },
  '@/shared/components/screen-message': { ScreenMessage: 'Message' },
  '@/features/learning/hooks/use-learning': {
    useCurrentChild: () => ({ data: { id: 'child', name: 'Child' } }),
  },
});
const dashboard = home.ParentHomeScreen();
assert.ok(nodes(dashboard).some((n) => n.type === 'Summary'));
assert.ok(!nodes(dashboard).some((n) => ['Order', 'Quantity', 'Exclusion'].includes(n.type)));
assert.ok(nodes(dashboard).some((n) => n.type === 'ReviewLinks'));
assert.ok(!nodes(dashboard).some((n) => n.type === 'Confirm'));
assert.ok(!nodes(dashboard).some((n) => n.type === 'Manual'));
nodes(dashboard)
  .find(
    (n) => n.type === 'Pressable' && nodes(n).some((c) => c.props?.children === '오늘 공부 편집'),
  )
  .props.onPress();
assert.equal(route, '/parent-today-edit');
console.log('PASS dashboard has summary and editor navigation; no inline today editors');
let pastQuery = { data: [{ id: 'past' }] };
const pastButton = load('src/features/learning/components/unresolved-manual-button.tsx', {
  ...base,
  'expo-router': {
    useRouter: () => ({
      push: (path) => {
        route = path;
      },
    }),
  },
  '@/shared/hooks/use-today': { useToday: () => '2026-09-17' },
  '@/features/learning/components/learning-controls': { LearningButton: 'Button' },
  '@/features/learning/hooks/use-learning': { useUnresolvedManualTasks: () => pastQuery },
}).UnresolvedManualButton;
assert.equal(pastButton({ childId: 'child' }).props.label, '지난 공부 1개 정리하기');
pastButton({ childId: 'child' }).props.onPress();
assert.equal(route, '/parent-review?tab=unresolved');
pastQuery = { isError: true };
assert.equal(pastButton({ childId: 'child' }).props.label, '지난 공부 정리하기');
const pastScreen = load('src/features/learning/screens/unresolved-manual-screen.tsx', {
  ...base,
  'react-native-safe-area-context': { SafeAreaView: 'Safe' },
  '@/features/learning/components/manual-tasks-panel': { ManualTasksPanel: 'Manual' },
  '@/features/learning/hooks/use-learning': { useCurrentChild: () => ({ data: { id: 'child' } }) },
  '@/shared/components/screen-message': { ScreenMessage: 'Message' },
}).UnresolvedManualScreen();
const pastPanel = nodes(pastScreen).find((n) => n.type === 'Manual');
assert.equal(pastPanel.props.mode, 'unresolved');
assert.equal(pastPanel.props.showList, true);
const pastRoot = readFileSync('src/app/_layout.tsx', 'utf8');
assert.match(
  pastRoot,
  /Stack.Protected guard=\{mode === 'parent'\}[\s\S]*name="parent-unresolved"/,
);
assert.ok(!layout.props.children.some((n) => n.props.name === 'parent-unresolved'));
console.log(
  'PASS past-study button navigates to protected non-tab detail with immediately visible list',
);
const summary = load('src/features/learning/components/today-plan-summary.tsx', {
  ...base,
  'lucide-react-native': {
    BookOpenCheck: 'BookOpenCheck',
    Clock3: 'Clock3',
    ClipboardList: 'ClipboardList',
  },
  '@/design-system/icons': { dashboardIconProps: {} },
  '@/features/learning/components/today-summary-card': { TodaySummaryCard: 'SummaryCard' },
  '@/features/learning/utils/visible-tasks': load(
    'src/features/learning/utils/visible-tasks.ts',
    {},
  ),
  react: { useCallback: (callback) => callback },
  'expo-router': { useFocusEffect: () => {} },
  '@/shared/components/parent-ui': {
    ParentSection: 'Section',
    ParentCard: 'Card',
    StatusChip: 'Chip',
  },
  '@/features/learning/components/learning-controls': {
    learningStyles: {},
    LearningButton: 'Button',
  },
  '@/features/learning/hooks/use-seoul-today': { useSeoulToday: () => '2026-09-17' },
  '@/features/learning/hooks/use-learning': {
    useContinuingTasks: () => ({ data: [] }),
    useDailyPlan: () => ({ data: { id: 'plan', target_minutes_snapshot: 60, day_type: 'REST' } }),
    useDailyTasks: () => ({
      data: [
        { id: 'a', name_snapshot: 'Active', planned_minutes: 20, status: 'PLANNED' },
        { id: 'b', name_snapshot: 'Excluded', planned_minutes: 10, excluded_for_today: true },
        { id: 'c', name_snapshot: 'Skipped', planned_minutes: 30, status: 'SKIPPED' },
      ],
    }),
  },
}).TodayPlanSummary({ childId: 'child' });
assert.ok(!JSON.stringify(summary).includes('Excluded'));
assert.ok(!JSON.stringify(summary).includes('Skipped'));
assert.ok(JSON.stringify(summary).includes('정기 휴식일'));
assert.ok(JSON.stringify(summary).includes('20분'));
console.log('PASS dashboard summary excludes skipped/excluded time and preserves REST labeling');

const editor = load('src/features/learning/screens/today-plan-edit-screen.tsx', {
  ...base,
  react,
  'expo-router': {
    useRouter: () => ({
      replace: (path) => {
        route = path;
      },
    }),
  },
  'react-native': {
    ...base['react-native'],
    ScrollView: 'ScrollView',
    Platform: { OS: 'android' },
  },
  'react-native-safe-area-context': { SafeAreaView: 'Safe' },
  '@/features/learning/components/learning-controls': { learningStyles: {} },
  '@/features/learning/components/today-plan-edit-gate': { TodayPlanEditGate: 'Gate' },
  '@/features/learning/components/manual-tasks-panel': { ManualTasksPanel: 'Manual' },
  '@/features/learning/components/task-order-panel': { TaskOrderPanel: 'Order' },
  '@/features/learning/components/task-quantity-panel': { TaskQuantityPanel: 'Quantity' },
  '@/features/learning/components/task-exclusion-panel': { TaskExclusionPanel: 'Exclusion' },
  '@/shared/components/screen-message': { ScreenMessage: 'Message' },
  '@/features/learning/hooks/use-seoul-today': { useSeoulToday: () => '2026-09-17' },
  '@/features/learning/hooks/use-learning': {
    useCurrentChild: () => ({ data: { id: 'child' } }),
    useDailyPlan: () => ({ data: { id: 'plan' } }),
    useDailyTasks: () => ({
      data: [{ id: 'a', name_snapshot: 'A', status: 'PLANNED', planned_minutes: 20 }],
    }),
  },
});
slots.length = 0;
const renderEditor = () => {
  cursor = 0;
  return editor.TodayPlanEditScreen();
};
const gate = nodes(renderEditor()).find((n) => n.type === 'Gate');
assert.equal(gate.props.autoStart, true, 'Direct route cannot bypass gate');
gate.props.onReview();
assert.equal(route, '/parent-review?tab=pending&returnTo=today-edit');
assert.equal(nodes(gate).find((n) => n.type === 'Manual').props.mode, 'add');
const cards = nodes(gate).find((n) => n.type === editor.TodayTaskCards);
cards.props.onDragStateChange(true);
assert.equal(nodes(renderEditor()).find((n) => n.type === 'ScrollView').props.scrollEnabled, false);
cards.props.onDragStateChange(false);
assert.equal(nodes(renderEditor()).find((n) => n.type === 'ScrollView').props.scrollEnabled, true);
const quantity = editor.TodayTaskCards(cards.props);
assert.equal(quantity.type, 'Quantity');
const exclusion = quantity.props.renderContent(new Map([['a', jsx('QuantityControls', {})]]), null);
assert.equal(exclusion.type, 'Exclusion');
const composed = exclusion.props.renderContent(
  new Map([['a', jsx('ExclusionControls', {})]]),
  null,
);
const list = nodes(composed)
  .find((n) => n.type === 'Order')
  .props.renderTask({ id: 'a', name_snapshot: 'A', status: 'PLANNED', planned_minutes: 20 });
const card = nodes(list).find(
  (n) => n.type === 'View' && nodes(n).some((x) => x.type === 'QuantityControls'),
);
assert.ok(
  card && nodes(card).some((n) => n.type === 'ExclusionControls'),
  'Both controls in the same task card',
);
gate.props.onClose();
assert.equal(route, '/parent/home');
const rootSource = readFileSync(new URL('../src/app/_layout.tsx', import.meta.url), 'utf8');
assert.match(
  rootSource,
  /Stack.Protected guard=\{mode === 'parent'\}[\s\S]*name="parent-today-edit"/,
);
assert.match(rootSource, /name="parent-today-edit"[\s\S]*headerRight: \(\) => <ChildModeButton/);
assert.ok(!layout.props.children.some((n) => n.props.name === 'parent-today-edit'));
console.log(
  'PASS dedicated editor: protected non-tab route, shared header, direct-entry gate, inline card composition, single quantity controller, drag scroll lock, close navigation',
);
