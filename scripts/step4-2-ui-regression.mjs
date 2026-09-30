// Executes production TSX with a small deterministic hook/JSX harness.
// This verifies handler/output logic, not the React renderer, Router or browser networking.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import ts from 'typescript';

import { uiMocks } from './ui-regression-mocks.mjs';

const token = new Proxy({}, { get: () => 8 });
const native = new Proxy(
  { StyleSheet: { create: (value) => value }, Platform: { OS: 'web' } },
  { get: (object, key) => object[key] ?? key },
);
const jsx = (type, props) => ({ type, props });
function loadPlain(path, imports = {}) {
  const output = ts.transpileModule(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', output)(
    (id) => {
      imports = uiMocks(imports);
      if (id in imports) return imports[id];
      throw new Error(`Unexpected plain import: ${id}`);
    },
    module,
    module.exports,
  );
  return module.exports;
}
const exceptionTasks = loadPlain('src/features/learning/utils/exception-tasks.ts');
const designTokens = loadPlain('src/design-system/tokens.ts');
const controls = loadPlain('src/features/learning/components/learning-controls.tsx', {
  'react/jsx-runtime': { jsx, jsxs: jsx },
  'react-native': native,
  '@/design-system/tokens': { colors: token, radius: token, sizing: token, spacing: token },
});
function harness(path, name, mocks) {
  const slots = [];
  let cursor = 0;
  let dirty = false;
  let effects = [];
  const react = {
    useState(value) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof value === 'function' ? value() : value;
      return [
        slots[index],
        (value) => {
          const next = typeof value === 'function' ? value(slots[index]) : value;
          if (!Object.is(next, slots[index])) dirty = true;
          slots[index] = next;
        },
      ];
    },
    useRef(value) {
      const index = cursor++;
      return slots[index] ?? (slots[index] = { current: value });
    },
    useEffect(callback, dependencies) {
      const index = cursor++;
      if (!slots[index] || dependencies.some((value, i) => !Object.is(value, slots[index][i]))) {
        slots[index] = dependencies;
        effects.push(callback);
      }
    },
  };
  const defaults = uiMocks({
    '@/shared/hooks/use-today': { useToday: () => '2026-09-10' },
    react,
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    'react-native': native,
    'react-native-safe-area-context': {
      useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
    },
    '@/design-system/tokens': designTokens,
    'lucide-react-native': { ChevronRight: 'ChevronRight' },
    '@/design-system/icons': { dashboardIconProps: { accessible: false } },
    'expo-router': {
      useRouter: () => ({ replace() {}, back() {} }),
      useLocalSearchParams: () => ({ taskId: 'task' }),
      Stack: { Screen: 'Screen' },
    },
    '@/shared/components/screen-message': { ScreenMessage: 'ScreenMessage' },
    '@/features/learning/utils/exception-tasks': exceptionTasks,
    '@/features/learning/components/learning-controls': controls,
    '@/features/learning/components/growth-visual': { GrowthVisual: 'GrowthVisual' },
    '@/features/learning/components/completion-reward': { CompletionReward: 'CompletionReward' },
    '@/features/learning/components/today-plan-edit-gate': { TodayPlanEditGate: 'EditGate' },
    '@/features/learning/components/quantity-conflict-resolution': {
      QuantityConflictResolution: 'Resolution',
    },
    '@/features/learning/components/task-exclusion-panel': { TaskExclusionPanel: 'Exclusion' },
    '@/features/learning/components/task-order-panel': { TaskOrderPanel: 'Order' },
    '@/features/learning/components/task-quantity-panel': { TaskQuantityPanel: 'Quantity' },
    '@/features/learning/components/parent-confirmation-panel': {
      ParentConfirmationPanel: 'ParentConfirmationPanel',
    },
    '@/features/learning/components/manual-tasks-panel': { ManualTasksPanel: 'ManualTasksPanel' },
    ...mocks,
  });
  const output = ts.transpileModule(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', output)(
    (id) => {
      if (id in mocks) return mocks[id];
      if (id in defaults) return defaults[id];
      throw new Error(`Missing mock: ${id}`);
    },
    module,
    module.exports,
  );
  return {
    render(props) {
      for (let i = 0; i < 10; i++) {
        dirty = false;
        cursor = 0;
        const tree = module.exports[name](props);
        const jobs = effects;
        effects = [];
        jobs.forEach((callback) => callback());
        if (!dirty) return tree;
      }
      throw new Error('Render loop');
    },
  };
}
function nodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (Object.values(controls).includes(tree.type) && typeof tree.type === 'function')
    return nodes(tree.type(tree.props));
  return [tree, ...nodes(tree.props?.children)];
}
function text(tree) {
  if (typeof tree === 'string' || typeof tree === 'number') return String(tree);
  if (!tree) return '';
  if (Array.isArray(tree)) return tree.map(text).join('');
  if (Object.values(controls).includes(tree.type) && typeof tree.type === 'function')
    return text(tree.type(tree.props));
  return text(tree.props?.children);
}
function button(tree, label) {
  const node = nodes(tree).find((node) => node.type === 'Pressable' && text(node) === label);
  assert.ok(node, `Button: ${label}`);
  return node.props;
}
const hooks = '@/features/learning/hooks/use-learning';
const mutation = { isPending: false, isError: false, mutate() {} };

let verdict = 'invalid';
let mode = 'child';
let route = null;
let logoutCalls = 0;
const pin = harness('src/features/auth/components/parent-mode-button.tsx', 'ParentModeButton', {
  'expo-router': {
    useRouter: () => ({
      replace: (value) => {
        route = value;
      },
    }),
  },
  '@/features/auth/hooks/use-auth': {
    useAuth: () => ({
      session: { user: { id: 'a' } },
      signOut: async () => {
        logoutCalls++;
      },
    }),
  },
  '@/features/auth/services/verify-parent-pin': { verifyParentPin: async () => verdict },
  '@/lib/supabase/client': {
    getSupabaseClient: () => ({
      auth: { getSession: async () => ({ data: { session: { user: { id: 'a' } } } }) },
    }),
  },
  '@/store/app-mode.store': {
    useAppModeStore: {
      getState: () => ({
        setMode: (value) => {
          mode = value;
        },
      }),
    },
  },
});
for (verdict of ['invalid', 'locked', 'valid']) {
  let tree = pin.render({ compact: true });
  button(tree, '부모님 모드').onPress();
  tree = pin.render();
  nodes(tree)
    .find((node) => node.type === 'TextInput')
    .props.onChangeText('1234');
  tree = pin.render();
  button(tree, '확인').onPress();
  await new Promise((resolve) => setImmediate(resolve));
  tree = pin.render();
  assert.equal(mode, verdict === 'valid' ? 'parent' : 'child');
  if (verdict === 'invalid') assert.ok(text(tree).includes('PIN이 맞지 않아요.'));
  if (verdict === 'locked') assert.ok(text(tree).includes('5분 뒤에 다시 시도해 주세요.'));
  assert.equal(nodes(tree).find((node) => node.type === 'TextInput').props.value, '');
}
assert.equal(route, '/');
mode = 'child';
let tree = pin.render();
button(tree, '부모님').onPress();
tree = pin.render();
// Keep the PIN locked throughout logout confirmation; no successful verification is required.
verdict = 'locked';
nodes(tree)
  .find((node) => node.type === 'TextInput')
  .props.onChangeText('1234');
tree = pin.render();
button(tree, '확인').onPress();
await new Promise((resolve) => setImmediate(resolve));
tree = pin.render();
assert.ok(text(tree).includes('5분 뒤에 다시 시도해 주세요.'));
button(tree, '로그아웃').onPress();
tree = pin.render();
assert.ok(text(tree).includes('로그아웃할까요?'));
assert.ok(text(tree).includes('다시 로그인해야 사용할 수 있어요.'));
assert.equal(logoutCalls, 0);
button(tree, '취소').onPress();
tree = pin.render();
assert.equal(logoutCalls, 0);
assert.equal(mode, 'child');
assert.ok(!text(tree).includes('로그아웃할까요?'));
button(tree, '로그아웃').onPress();
tree = pin.render();
button(tree, '로그아웃').onPress();
await new Promise((resolve) => setImmediate(resolve));
assert.equal(logoutCalls, 1);
console.log(
  'PASS PIN UI: 5-minute lock message, invalid/locked remain child, valid uses root, logout requires confirmation; cancel preserves session; locked logout allowed',
);

let item = {
  id: 'one',
  status: 'COMPLETED',
  revealed_at: null,
  progress_points: 1,
  growth_goal_snapshot: 1,
  collectible_catalog: { name: 'HIDDEN_NAME' },
};
let success = false;
const reveal = {
  ...mutation,
  mutate(id, callbacks) {
    this.isError = !success;
    if (success) callbacks.onSuccess('HIDDEN_NAME');
  },
};
const collection = harness(
  'src/features/learning/components/collection-panel.tsx',
  'CollectionPanel',
  {
    '@tanstack/react-query': { useQueryClient: () => ({ invalidateQueries: async () => {} }) },
    [hooks]: {
      learningKeys: { all: ['learning'] },
      useCurrentCollectible: () => ({ data: item }),
      useRevealCollectible: () => reveal,
      useSelectCollectionTheme: () => mutation,
    },
  },
);
const props = { child: { id: 'child', selected_collection_theme_code: 'DINO' } };
tree = collection.render(props);
button(tree, '새 친구 공개하기').onPress();
tree = collection.render(props);
assert.ok(!text(tree).includes('HIDDEN_NAME'));
assert.ok(text(tree).includes('지금은 열어볼 수 없어요.'));
success = true;
button(tree, '새 친구 공개하기').onPress();
tree = collection.render(props);
assert.ok(text(tree).includes('HIDDEN_NAME'));
item = { ...item, id: 'two', status: 'GROWING' };
assert.ok(!text(collection.render(props)).includes('HIDDEN_NAME'));
console.log('PASS reveal: failure hides identity, success shows it, next collectible clears it');

let calls = 0;
const ensure = {
  ...mutation,
  isError: true,
  mutate: () => {
    calls++;
  },
};
const today = harness('src/features/learning/screens/child-today-screen.tsx', 'ChildTodayScreen', {
  [hooks]: {
    useCurrentChild: () => ({ data: { id: 'child' } }),
    useEnsureDailyPlan: () => ({ ...ensure }),
    useDailyPlan: () => ({}),
    useDailyTasks: () => ({}),
    useContinuingTasks: () => ({}),
    useStartDailyTask: () => mutation,
  },
  '@/features/learning/utils/visible-tasks': {
    groupTodayTasks: () => ({
      today: [],
      continuing: [],
      todayCount: 0,
      todayMinutes: 0,
      continuingMinutes: 0,
    }),
  },
  '@/shared/utils/date': { toLocalDateString: () => '2026-09-10' },
});
tree = today.render();
assert.equal(calls, 1);
today.render();
assert.equal(calls, 1);
tree.props.onAction();
today.render();
today.render();
assert.equal(calls, 2);
console.log('PASS ensure: initial 1, one retry adds 1, rerenders add 0');

let confirmCalls = 0;
const parent = harness(
  'src/features/learning/components/parent-confirmation-panel.tsx',
  'ParentConfirmationPanel',
  {
    'expo-router': {
      useRouter: () => ({
        replace: (value) => {
          route = value;
        },
      }),
    },
    [hooks]: {
      useReviewTasks: () => ({ data: [] }),
      useCurrentChild: () => ({ data: { id: 'child', name: 'test' } }),
      useStudyItems: () => ({ data: [{ id: 'item', workbook_last_page: 100 }] }),
      usePendingConfirmations: () => ({
        data: [
          {
            id: 'task',
            study_item_id: 'item',
            item_type: 'WORKBOOK',
            planned_start_page: 1,
            planned_end_page: 5,
            daily_plans: { plan_date: '2026-09-10' },
          },
        ],
      }),
      useConfirmDailyTasks: () => ({
        ...mutation,
        mutate: () => {
          confirmCalls++;
        },
      }),
    },
    '@/store/app-mode.store': {
      useAppModeStore: () => (value) => {
        mode = value;
      },
    },
  },
);
tree = parent.render({ childId: 'child' });
nodes(tree)
  .find((node) => node.type === 'TextInput')
  .props.onChangeText('101');
tree = parent.render({ childId: 'child' });
button(tree, '확인').onPress();
tree = parent.render({ childId: 'child' });
assert.equal(confirmCalls, 0);
assert.ok(text(tree).includes('마지막 쪽을 넘을 수 없어요.'));
nodes(tree)
  .find((node) => node.type === 'TextInput')
  .props.onChangeText('100');
tree = parent.render({ childId: 'child' });
button(tree, '확인').onPress();
assert.equal(confirmCalls, 1);
const childModeButton = harness(
  'src/features/auth/components/child-mode-button.tsx',
  'ChildModeButton',
  {
    'expo-router': {
      useRouter: () => ({
        replace: (value) => {
          route = value;
        },
      }),
    },
    [hooks]: {
      useCurrentChild: () => ({ data: { id: 'child', name: 'test' } }),
      useStudyItems: () => ({ data: [] }),
    },
    '@/store/app-mode.store': {
      useAppModeStore: () => (value) => {
        mode = value;
      },
    },
  },
);
tree = childModeButton.render();
button(tree, '아이 화면').onPress();
assert.equal(mode, 'child');
assert.equal(route, '/');
console.log('PASS workbook upper bound and parent-to-child root navigation');

let status;
const session = harness(
  'src/features/learning/screens/study-session-screen.tsx',
  'StudySessionScreen',
  {
    [hooks]: {
      useDailyTask: () => ({
        data: {
          id: 'task',
          status,
          item_type: 'ACTIVITY',
          name_snapshot: 'test',
          planned_minutes: 20,
        },
      }),
      useStartDailyTask: () => mutation,
      useCompleteDailyTask: () => mutation,
    },
  },
);
for (status of ['CHILD_COMPLETED', 'PARENT_CONFIRMED', 'PARTIAL', 'SKIPPED']) {
  tree = session.render();
  assert.equal(nodes(tree).filter((node) => node.type === 'Pressable').length, 0);
  assert.ok(!text(tree).includes(status));
}
status = 'RETRY';
assert.equal(button(session.render(), '다시 하기').disabled, false);
// Step 5 polish: exercise actual shared inputs and manual-panel handlers.
let entered = '';
for (const numeric of [true, false]) {
  const field = controls.LearningField({
    label: 'input',
    value: '',
    numeric,
    onChangeText: (value) => {
      entered = value;
    },
  });
  nodes(field)
    .find((node) => node.type === 'TextInput')
    .props.onChangeText('1a 2.3쪽');
  assert.equal(entered, numeric ? '123' : '1a 2.3쪽');
}
let savedManual;
let moveCalls = 0;
let skipCalls = 0;
const pastTasks = ['first', 'last'].map((id) => ({
  id,
  name_snapshot: id,
  status: 'IN_PROGRESS',
  item_type: 'ACTIVITY',
  planned_minutes: 20,
  daily_plans: { plan_date: '2026-09-01' },
}));
const manual = harness(
  'src/features/learning/components/manual-tasks-panel.tsx',
  'ManualTasksPanel',
  {
    '@/shared/utils/date': { toLocalDateString: () => '2026-09-10' },
    [hooks]: {
      useDailyPlan: () => ({ data: { id: 'plan', target_minutes_snapshot: 60 } }),
      useDailyTasks: () => ({ data: [] }),
      useUnresolvedManualTasks: () => ({ data: pastTasks }),
      useAddManualDailyTask: () => ({
        ...mutation,
        mutate: (input, callbacks) => {
          savedManual = input;
          callbacks.onSuccess();
          callbacks.onSettled();
        },
      }),
      useRescheduleManualTask: () => ({
        ...mutation,
        mutate: (_input, callbacks) => {
          moveCalls++;
          callbacks.onSuccess();
          callbacks.onSettled();
        },
      }),
      useSkipManualTask: () => ({
        ...mutation,
        mutate: (_input, callbacks) => {
          skipCalls++;
          callbacks.onSuccess();
          callbacks.onSettled();
        },
      }),
    },
  },
);
const manualTree = () => manual.render({ childId: 'child' });
const inputField = (label) =>
  nodes(manualTree()).find(
    (node) => node.type === 'TextInput' && node.props.accessibilityLabel === label,
  ).props;
const chooseType = (label) =>
  nodes(manualTree())
    .find((node) => node.props?.accessibilityLabel === label)
    .props.onPress();
button(manualTree(), '+ 오늘 할 일 추가').onPress();
inputField('오늘 할 일 시작 쪽').onChangeText('12');
inputField('오늘 할 일 마지막 쪽').onChangeText('19');
chooseType('오늘 할 일 활동');
assert.ok(
  !nodes(manualTree()).some((node) => node.props?.accessibilityLabel === '오늘 할 일 시작 쪽'),
);
chooseType('오늘 할 일 문제집');
assert.equal(inputField('오늘 할 일 시작 쪽').value, '1');
assert.equal(inputField('오늘 할 일 마지막 쪽').value, '5');
inputField('오늘 할 일 이름').onChangeText('숙제');
inputField('오늘 할 일 예상시간 (분)').onChangeText('40');
inputField('오늘 할 일 시작 쪽').onChangeText('11');
inputField('오늘 할 일 마지막 쪽').onChangeText('15');
chooseType('오늘 할 일 과목 수학');
button(manualTree(), '오늘 할 일 저장').onPress();
assert.equal(savedManual.startPage, 11);
button(manualTree(), '+ 오늘 할 일 추가').onPress();
assert.equal(inputField('오늘 할 일 이름').value, '');
assert.equal(inputField('오늘 할 일 예상시간 (분)').value, '20');
assert.equal(inputField('오늘 할 일 시작 쪽').value, '1');
assert.equal(inputField('오늘 할 일 마지막 쪽').value, '5');
assert.ok(
  nodes(manualTree()).find(
    (node) => node.props?.accessibilityLabel === '오늘 할 일 과목 선택 안 함',
  ).props.accessibilityState.selected,
);
chooseType('오늘 할 일 활동');
inputField('오늘 할 일 이름').onChangeText('독서');
button(manualTree(), '오늘 할 일 저장').onPress();
assert.equal(savedManual.startPage, null);
assert.equal(savedManual.endPage, null);
button(manualTree(), '+ 오늘 할 일 추가').onPress();
assert.equal(inputField('오늘 할 일 시작 쪽').value, '1');
button(manualTree(), '지난 공부 2개 정리하기').onPress();
for (const [label, confirmLabel] of [
  ['오늘에 추가', '오늘로 옮기기 확인'],
  ['이번엔 넘기기', '넘기기 확인'],
]) {
  button(
    nodes(manualTree()).find(
      (node) =>
        node.type === 'View' &&
        Array.isArray(node.props.children) &&
        text(node.props.children[0]) === 'first',
    ),
    label,
  ).onPress();
  tree = manualTree();
  const firstCard = nodes(tree).find(
    (node) =>
      node.type === 'View' &&
      Array.isArray(node.props.children) &&
      text(node.props.children[0]) === 'first' &&
      text(node).includes('오늘에 추가'),
  );
  assert.ok(firstCard, 'target task card');
  assert.ok(text(firstCard).includes('진행 중인 공부예요.'));
  assert.ok(nodes(firstCard).some((node) => node.props?.accessibilityViewIsModal));
  assert.ok(button(firstCard, confirmLabel));
  assert.equal(
    nodes(tree).filter((node) => node.props?.accessibilityViewIsModal).length,
    1,
    'confirmation belongs only to the selected card, not a separate list footer',
  );
  assert.equal(moveCalls + skipCalls, label === '오늘에 추가' ? 0 : 1);
  button(firstCard, '취소').onPress();
  assert.ok(!text(manualTree()).includes(confirmLabel));
  button(
    nodes(manualTree()).find(
      (node) =>
        node.type === 'View' &&
        Array.isArray(node.props.children) &&
        text(node.props.children[0]) === 'first',
    ),
    label,
  ).onPress();
  button(manualTree(), confirmLabel).onPress();
}
assert.equal(moveCalls, 1);
assert.equal(skipCalls, 1);
tree = manual.render({ childId: 'child', mode: 'unresolved', showList: true });
assert.ok(text(tree).includes('first'));
assert.ok(!text(tree).includes('지난 공부 2개 정리하기'));
assert.ok(!text(tree).includes('+ 오늘 할 일 추가'));
pastTasks.length = 0;
assert.ok(
  text(manual.render({ childId: 'child', mode: 'unresolved', showList: true })).includes(
    '정리할 지난 공부가 없어요.',
  ),
);
console.log(
  'PASS Step 5 polish: numeric sanitization, type/reset fields, task-local confirmation and cancel',
);
console.log('PASS finalized CTA: all four terminal states hidden; RETRY enabled');

mode = 'child';
let handledGate = 0;
tree = pin.render({
  openRequest: 1,
  onOpenRequestHandled: () => {
    handledGate++;
  },
});
assert.equal(nodes(tree).find((node) => node.type === 'Modal').props.visible, true);
assert.equal(mode, 'child', 'notification request must not grant parent mode');
button(tree, '취소').onPress();
assert.equal(handledGate, 1);
assert.equal(nodes(pin.render()).find((node) => node.type === 'Modal').props.visible, false);
verdict = 'valid';
tree = pin.render({ openRequest: 2 });
nodes(tree)
  .find((node) => node.type === 'TextInput')
  .props.onChangeText('1234');
tree = pin.render({ openRequest: 2 });
button(tree, '확인').onPress();
await new Promise((resolve) => setImmediate(resolve));
assert.equal(mode, 'parent');
assert.equal(
  route,
  '/?destination=parent-review',
  'Notification PIN success uses safe root redirect',
);
let enabledNotifications = 0;
let savedNotifications;
const notificationDefaults = {
  notificationsEnabled: false,
  parentCheckReminderEnabled: false,
  parentCheckReminderTime: '',
  unfinishedReminderEnabled: false,
  unfinishedReminderTime: '',
};
const notificationSettings = harness(
  'src/features/notifications/notification-settings-panel.tsx',
  'NotificationSettingsPanel',
  {
    './notification-time-field': { NotificationTimeField: 'NotificationTimeField' },
    '@/features/notifications/notification-context': {
      useNotifications: () => ({
        settings: notificationDefaults,
        permission: 'undetermined',
        ready: true,
        supported: true,
        enable: async () => {
          enabledNotifications++;
        },
        save: async (value) => {
          savedNotifications = value;
        },
      }),
    },
    '@/features/notifications/types': loadPlain('src/features/notifications/types.ts'),
  },
);
tree = notificationSettings.render();
assert.equal(enabledNotifications, 0);
button(tree, '설명을 확인했어요 · 알림 켜기').onPress();
await new Promise((resolve) => setImmediate(resolve));
assert.equal(enabledNotifications, 1);
tree = notificationSettings.render();
nodes(tree)
  .find((node) => node.type === 'Switch' && node.props.accessibilityLabel === '부모 확인시간 알림')
  .props.onValueChange(true);
tree = notificationSettings.render();
assert.equal(savedNotifications, undefined, 'switch edits remain draft until save');
button(tree, '알림 설정 저장').onPress();
assert.equal(savedNotifications, undefined);
assert.ok(text(notificationSettings.render()).includes('24시간 형식'));
nodes(notificationSettings.render())
  .find(
    (node) => node.type === 'NotificationTimeField' && node.props.label === '부모 확인시간 알림',
  )
  .props.onChange('20:30');
assert.equal(savedNotifications, undefined, 'time edits remain draft until save');
button(notificationSettings.render(), '알림 설정 저장').onPress();
await new Promise((resolve) => setImmediate(resolve));
assert.equal(savedNotifications.parentCheckReminderTime, '20:30');
assert.equal(savedNotifications.parentCheckReminderEnabled, true);
assert.ok(text(notificationSettings.render()).includes('알림 설정을 저장했어요.'));
console.log(
  'PASS Step 6 UI: notification opens PIN without bypass; explicit permission action and HH:MM validation',
);
