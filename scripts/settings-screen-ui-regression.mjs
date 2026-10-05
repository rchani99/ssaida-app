import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import ts from 'typescript';

let cursor = 0;
const slots = [];
const jsx = (type, props) => (typeof type === 'function' ? type(props) : { type, props });
const nodes = (value) =>
  !value || typeof value !== 'object'
    ? []
    : Array.isArray(value)
      ? value.flatMap(nodes)
      : [value, ...nodes(value.props?.children)];
const text = (value) =>
  typeof value === 'string'
    ? value
    : Array.isArray(value)
      ? value.map(text).join('')
      : value?.props
        ? text(value.props.children)
        : '';
let signOutCalls = 0;
let sensitiveEnabled = false;
let hardwareBackHandler;
let navigationOptions = {};
let child = { data: { id: 'child', name: '민준', rest_weekdays: [7], daily_target_minutes: 60 } };
let notification = {
  supported: true,
  ready: true,
  permission: 'granted',
  settings: { notificationsEnabled: true },
};
const icons = Object.fromEntries(
  [
    'Bell',
    'CalendarDays',
    'ChevronLeft',
    'ChevronRight',
    'Clock3',
    'Info',
    'LogOut',
    'ShieldCheck',
    'UserRound',
  ].map((name) => [name, name]),
);
const mocks = {
  '@/features/auth/services/sensitive-actions-enabled': {
    sensitiveActionsEnabled: () => sensitiveEnabled,
  },
  '@/features/auth/components/sensitive-account-panel': { SensitiveAccountPanel: 'SensitivePanel' },
  react: {
    useCallback: (callback) => callback,
    useLayoutEffect: (callback) => callback(),
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = initial;
      return [
        slots[index],
        (value) => (slots[index] = typeof value === 'function' ? value(slots[index]) : value),
      ];
    },
  },
  'expo-router': {
    useFocusEffect: (callback) => callback(),
    useNavigation: () => ({
      setOptions: (options) => {
        navigationOptions = options;
      },
    }),
  },
  'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
  'react-native': {
    ActivityIndicator: 'Loading',
    BackHandler: {
      addEventListener: (_event, handler) => {
        hardwareBackHandler = handler;
        return { remove() {} };
      },
    },
    Pressable: 'Button',
    ScrollView: 'Scroll',
    StyleSheet: { create: (value) => value },
    Text: 'Text',
    View: 'View',
  },
  'lucide-react-native': icons,
  '@/design-system/icons': { dashboardIconProps: {} },
  '@/design-system/tokens': {
    dashboardTokens: {
      colors: {
        primary: 'green',
        danger: 'red',
        background: 'bg',
        card: 'white',
        textPrimary: 'black',
        textSecondary: 'gray',
        divider: 'line',
      },
      spacing: { 4: 4, 8: 8, 12: 12, 16: 16, 24: 24 },
      typography: { section: {}, body: {}, caption: {}, button: {} },
      layout: { screenPadding: 16 },
      radius: { large: 20, pill: 999 },
      border: { card: {} },
      shadow: {},
      icon: { touchMin: 48, size: { small: 16 } },
    },
  },
  '@/features/auth/hooks/use-auth': { useAuth: () => ({ signOut: async () => signOutCalls++ }) },
  '@/features/auth/components/child-settings-panel': { ChildSettingsPanel: 'ChildPanel' },
  '@/features/auth/components/parent-pin-settings-panel': { ParentPinSettingsPanel: 'PinPanel' },
  '@/features/auth/components/service-info-panel': { ServiceInfoPanel: 'ServicePanel' },
  '@/features/auth/components/account-management-info-panel': {
    AccountManagementInfoPanel: 'AccountInfoPanel',
  },
  '@/features/learning/components/daily-target-settings-panel': {
    DailyTargetSettingsPanel: 'TargetPanel',
  },
  '@/features/learning/components/rest-weekdays-panel': { RestWeekdaysPanel: 'RestPanel' },
  '@/features/learning/hooks/use-learning': { useCurrentChild: () => child },
  '@/features/notifications/notification-context': { useNotifications: () => notification },
  '@/features/notifications/notification-settings-panel': {
    NotificationSettingsPanel: 'NotificationPanel',
  },
};
const module = { exports: {} };
new Function(
  'require',
  'module',
  'exports',
  ts.transpileModule(readFileSync('src/features/auth/screens/settings-screen.tsx', 'utf8'), {
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
const { SettingsScreen } = module.exports;
const render = () => {
  cursor = 0;
  return SettingsScreen();
};
const press = (label) => {
  const button = nodes(render()).find(
    (node) => node.type === 'Button' && node.props.accessibilityLabel?.startsWith(label),
  );
  assert.ok(button, label);
  button.props.onPress();
};

let tree = render();
for (const copy of [
  '학습 설정',
  '정기 휴식 요일',
  '일',
  '알림 설정',
  '켜짐',
  '학습 시간 기본값',
  '60분',
])
  assert.ok(text(tree).includes(copy), copy);
for (const copy of ['계정 / 보안', '부모 PIN 변경', '현재 PIN 확인 후 변경', '사용 중'])
  assert.ok(text(tree).includes(copy), copy);
for (const copy of ['아이', '아이 정보 관리', '민준', '앱 정보', '서비스 정보'])
  assert.ok(text(tree).includes(copy), copy);
assert.equal(
  nodes(tree).filter((node) => node.type === 'RestPanel' || node.type === 'NotificationPanel')
    .length,
  0,
);

press('정기 휴식 요일');
tree = render();
assert.equal(nodes(tree).filter((node) => node.type === 'RestPanel').length, 1);
assert.equal(navigationOptions.title, '설정');
navigationOptions.headerLeft().props.onPress();
assert.ok(text(render()).includes('정기 휴식 요일'));
press('알림 설정');
assert.equal(nodes(render()).filter((node) => node.type === 'NotificationPanel').length, 1);
assert.equal(navigationOptions.title, '설정');
assert.equal(hardwareBackHandler(), true);
assert.ok(text(render()).includes('알림 설정'));

for (const [label, title, panel] of [
  ['학습 시간 기본값', '학습 시간 기본값', 'TargetPanel'],
  ['부모 PIN 변경', '부모 PIN 변경', 'PinPanel'],
  ['아이 정보 관리', '아이 정보 관리', 'ChildPanel'],
  ['서비스 정보', '서비스 정보', 'ServicePanel'],
]) {
  press(label);
  tree = render();
  assert.equal(nodes(tree).filter((node) => node.type === panel).length, 1, panel);
  assert.equal(navigationOptions.title, '설정', title);
  navigationOptions.headerLeft().props.onPress();
  assert.ok(text(render()).includes(label));
}

child = { data: { id: 'child', name: '민준', rest_weekdays: [1, 3], daily_target_minutes: 90 } };
for (const [label, kind] of [
  ['계정 삭제', 'deletion'],
  ['부모 PIN 재설정', 'recovery'],
]) {
  press(label);
  const panel = nodes(render()).find((node) => node.type === 'AccountInfoPanel');
  assert.equal(panel?.props.kind, kind);
  assert.equal(hardwareBackHandler(), true);
  assert.ok(text(render()).includes(label));
  assert.equal(signOutCalls, 0);
}

// Render the real informational panels: unavailable services must not expose executable actions.
sensitiveEnabled = true;
for (const [label, kind] of [
  ['계정 삭제', 'deletion'],
  ['부모 PIN 재설정', 'recovery'],
]) {
  press(label);
  assert.equal(nodes(render()).find((node) => node.type === 'SensitivePanel')?.props.kind, kind);
  hardwareBackHandler();
}
sensitiveEnabled = false;
for (const [file, name, props] of [
  ['account-management-info-panel', 'AccountManagementInfoPanel', { kind: 'deletion' }],
  ['account-management-info-panel', 'AccountManagementInfoPanel', { kind: 'recovery' }],
  ['service-info-panel', 'ServiceInfoPanel', {}],
]) {
  const loaded = { exports: {} };
  new Function(
    'require',
    'module',
    'exports',
    ts.transpileModule(readFileSync(`src/features/auth/components/${file}.tsx`, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    }).outputText,
  )(
    (id) => {
      if (id === 'expo-constants')
        return { __esModule: true, default: { expoConfig: { version: '1.2.3' } } };
      if (id === '@/features/learning/components/learning-controls') return { learningStyles: {} };
      if (id in mocks) return mocks[id];
      throw new Error(`Unexpected dependency: ${id}`);
    },
    loaded,
    loaded.exports,
  );
  const info = loaded.exports[name](props);
  assert.equal(nodes(info).filter((node) => node.props?.onPress).length, 0);
  if (props.kind === 'deletion') assert.ok(text(info).includes('삭제를 요청할 수 없어요'));
  if (props.kind === 'recovery') assert.ok(text(info).includes('PIN은 초기화되지 않아요'));
  if (name === 'ServiceInfoPanel') {
    for (const label of ['1.2.3', '개인정보처리방침', '이용약관', '문의하기'])
      assert.ok(text(info).includes(label));
    assert.ok(!text(info).includes('https://'));
  }
}
notification = { ...notification, settings: { notificationsEnabled: false } };
tree = render();
assert.ok(text(tree).includes('월·수'));
assert.ok(text(tree).includes('꺼짐'));
assert.ok(text(tree).includes('90분'));
press('로그아웃');
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(signOutCalls, 1);
const parentLayout = readFileSync('src/app/parent/_layout.tsx', 'utf8');
const childButton = readFileSync('src/features/auth/components/child-mode-button.tsx', 'utf8');
assert.match(parentLayout, /headerRight:\s*\(\) => <ChildModeButton dashboard \/>/);
assert.match(childButton, /accessibilityLabel="아이 화면"/);
assert.match(childButton, /setMode\('child'\)/);
assert.match(childButton, /router\.replace\('\/'\)/);
console.log(
  'PASS settings list/detail, current values after re-entry, MVP detail panels, child summary, logout and shared child button',
);
