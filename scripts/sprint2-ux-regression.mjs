import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import ts from 'typescript';

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
      assert.ok(id in mocks, id);
      return mocks[id];
    },
    module,
    module.exports,
  );
  return module.exports;
}
const jsx = (type, props) => ({ type, props });
const tokens = { colors: {}, radius: {}, sizing: { buttonHeight: 52 }, spacing: { sm: 8, md: 16 } };
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
  'expo-router': { Tabs },
  '@/features/auth/components/child-mode-button': button,
}).default();
assert.deepEqual(
  layout.props.children.map((c) => c.props.name),
  ['home', 'records', 'settings'],
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
  'PASS common header: home/records/settings expose child-mode action with unchanged routing',
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
  count: 4,
  height: 80,
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
assert.equal(render().props.style.at(-1).transform[0].translateY, 176, 'clamp bottom');
handle().onPanResponderRelease({}, { dy: 180 });
assert.deepEqual(moves, [[1, 3]]);
assert.deepEqual(transitions, [true, false]);
handle().onPanResponderGrant();
handle().onPanResponderMove({}, { dy: -999 });
assert.equal(render().props.style.at(-1).transform[0].translateY, -88, 'clamp top');
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
  react,
  'react-native': {
    ...base['react-native'],
    ScrollView: 'ScrollView',
    Platform: { OS: 'android' },
  },
  '@/features/learning/components/manual-tasks-panel': { ManualTasksPanel: 'Manual' },
  '@/features/learning/components/parent-confirmation-panel': {
    ParentConfirmationPanel: 'Confirm',
  },
  '@/features/learning/components/task-order-panel': { TaskOrderPanel: 'Order' },
  '@/features/learning/components/task-quantity-panel': { TaskQuantityPanel: 'Quantity' },
  '@/features/learning/components/task-exclusion-panel': { TaskExclusionPanel: 'Exclusion' },
  '@/shared/components/screen-message': { ScreenMessage: 'Message' },
  '@/features/learning/hooks/use-learning': {
    useCurrentChild: () => ({ data: { id: 'child', name: 'Child' } }),
    useStudyItems: () => ({ data: [] }),
  },
});
slots.length = 0;
const renderHome = () => {
  cursor = 0;
  return home.ParentHomeScreen();
};
assert.equal(nodes(renderHome()).find((n) => n.type === 'ScrollView').props.scrollEnabled, true);
nodes(renderHome())
  .find((n) => n.type === 'Order')
  .props.onDragStateChange(true);
assert.equal(nodes(renderHome()).find((n) => n.type === 'ScrollView').props.scrollEnabled, false);
nodes(renderHome())
  .find((n) => n.type === 'Order')
  .props.onDragStateChange(false);
assert.equal(nodes(renderHome()).find((n) => n.type === 'ScrollView').props.scrollEnabled, true);
assert.ok(
  !nodes(renderHome()).some((n) => n.props?.children === '아이 화면'),
  'No duplicate body button',
);
console.log('PASS parent home scroll is locked only while dragging; duplicate body action removed');
