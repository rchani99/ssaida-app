import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { MutationObserver, QueryClient, QueryObserver } from '@tanstack/react-query';
import ts from 'typescript';

function load(path, mocks, timer = setTimeout) {
  const module = { exports: {} };
  const output = ts.transpileModule(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  new Function('require', 'module', 'exports', '__DEV__', 'setTimeout', output)(
    (id) => {
      if (!(id in mocks)) throw new Error(id);
      return mocks[id];
    },
    module,
    module.exports,
    false,
    timer,
  );
  return module.exports;
}

for (const outcome of ['success', 'conflict', 'network', 'timeout']) {
  let signal;
  let requests = 0;
  const api = load(
    'src/features/learning/api/learning-api.ts',
    {
      '@/features/learning/utils/exception-tasks': {},
      '@/lib/supabase/client': {
        getSupabaseClient: () => ({
          rpc: () => ({
            abortSignal: (value) => {
              signal = value;
              requests++;
              if (outcome === 'timeout') return new Promise(() => {});
              if (outcome === 'network') return Promise.reject(new TypeError('Network failed'));
              return Promise.resolve({
                error:
                  outcome === 'conflict' ? { code: 'PT409', message: 'private SQL detail' } : null,
              });
            },
          }),
        }),
      },
    },
    (callback, delay) => {
      assert.equal(delay, 15000, 'Production request deadline');
      return setTimeout(callback, outcome === 'timeout' ? 5 : delay);
    },
  );
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { gcTime: Infinity },
    },
  });
  const key = ['learning', 'tasks', 'plan'];
  client.setQueryData(key, ['old']);
  let fetches = 0;
  let resolveFetch;
  // Instrumentation is not server query input.
  const query = new QueryObserver(client, {
    queryKey: key,
    staleTime: Infinity,
    queryFn: () => {
      fetches++;
      return new Promise((resolve) => {
        resolveFetch = resolve;
      });
    },
  });
  const stopQuery = query.subscribe(() => {});
  let options;
  const hooks = load('src/features/learning/hooks/use-learning.ts', {
    '@tanstack/react-query': {
      useQueryClient: () => client,
      useMutation: (value) => {
        options = value;
      },
    },
    '@/features/learning/api/learning-api': api,
  });
  hooks.useExcludeDailyTask();
  assert.equal(options.retry, false);
  assert.equal(options.networkMode, 'always');
  const mutation = new MutationObserver(client, options);
  const stopMutation = mutation.subscribe(() => {});
  let settled = false;
  let callbackError;
  let watchdog;
  try {
    const result = mutation.mutate(
      { task: { id: 'task', updated_at: 'v1' } },
      {
        onError: (error) => {
          callbackError = error;
        },
        onSettled: () => {
          settled = true;
        },
      },
    );
    const bounded = Promise.race([
      result,
      new Promise((_, reject) => {
        watchdog = setTimeout(() => reject(new Error('Mutation remained pending')), 1000);
      }),
    ]);
    if (outcome === 'success') await bounded;
    else
      await assert.rejects(
        bounded,
        (error) =>
          error instanceof api.TaskExclusionError &&
          error.kind === (outcome === 'conflict' ? 'conflict' : 'request'),
      );
    assert.equal(mutation.getCurrentResult().isPending, false);
    assert.equal(settled, true, 'Call-level cleanup runs before refetch resolves');
    assert.equal(requests, 1, 'Do not retry stale or unknown-outcome writes');
    assert.equal(fetches, 1, 'Refresh success AND failure');
    if (outcome === 'conflict') assert.equal(callbackError.kind, 'conflict');
    if (outcome === 'timeout') assert.equal(signal.aborted, true);
    resolveFetch(['latest']);
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.deepEqual(client.getQueryData(key), ['latest']);
    console.log(
      `PASS real TanStack exclusion ${outcome}: pending released, callbacks run, latest refetched`,
    );
  } finally {
    clearTimeout(watchdog);
    stopMutation();
    stopQuery();
    client.clear();
  }
}

const slots = [];
let cursor = 0;
const make = (id, overrides = {}) => ({
  id,
  name_snapshot: id,
  source_type: 'AUTO',
  item_type: 'ACTIVITY',
  status: 'PLANNED',
  started_at: null,
  updated_at: 'v1',
  daily_plan_id: 'plan',
  study_item_id: id,
  planned_minutes: 20,
  sort_order: 0,
  excluded_for_today: false,
  quantity_conflict: null,
  ...overrides,
});
let rows = [
  make('A'),
  make('B'),
  make('Excluded', { excluded_for_today: true }),
  make('Conflict', { quantity_conflict: 'GAP' }),
  ...['IN_PROGRESS', 'CHILD_COMPLETED', 'RETRY', 'PARENT_CONFIRMED', 'PARTIAL', 'SKIPPED'].map(
    (status) => make(status, { status }),
  ),
  make('Started planned', { started_at: 'now' }),
  make('Manual', { source_type: 'MANUAL' }),
  make('Rescheduled', { source_type: 'RESCHEDULED' }),
];
const rules = load('src/features/learning/utils/task-order.ts', {});
const api = load('src/features/learning/api/learning-api.ts', {
  '@/features/learning/utils/exception-tasks': {},
  '@/lib/supabase/client': {},
});
let callbacks, input;
let saves = 0,
  reloads = 0,
  pending = false;
let date = '2026-09-17';
const jsx = (type, props) => ({ type, props });
const react = {
  useState(value) {
    const i = cursor++;
    if (!(i in slots)) slots[i] = typeof value === 'function' ? value() : value;
    return [
      slots[i],
      (next) => {
        slots[i] = typeof next === 'function' ? next(slots[i]) : next;
      },
    ];
  },
  useRef(value) {
    const i = cursor++;
    return slots[i] ?? (slots[i] = { current: value });
  },
  useEffect() {},
};
const native = { Text: 'Text', View: 'View', AppState: {}, StyleSheet: { create: (v) => v } };
const mocks = {
  react,
  'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
  'react-native': native,
  '@/features/learning/api/learning-api': api,
  '@/features/learning/utils/task-order': { ...rules, seoulDate: () => date },
  '@/features/learning/components/learning-controls': {
    LearningButton: 'Button',
    learningStyles: {},
  },
  '@/features/learning/hooks/use-learning': {
    useDailyPlan: () => ({ data: { id: 'plan' } }),
    useDailyTasks: () => ({
      data: rows,
      refetch: async () => {
        reloads++;
        return { data: rows, isError: false };
      },
    }),
    useExcludeDailyTask: () => ({
      isPending: pending,
      mutate: (value, options) => {
        saves++;
        input = value;
        callbacks = options;
      },
    }),
  },
};
const panel = load('src/features/learning/components/task-exclusion-panel.tsx', mocks);
const render = () => {
  cursor = 0;
  return panel.TaskExclusionPanel({ childId: 'child' });
};
const nodes = (t) =>
  !t || typeof t !== 'object'
    ? []
    : Array.isArray(t)
      ? t.flatMap(nodes)
      : [t, ...nodes(t.props?.children)];
const button = (label) => {
  const n = nodes(render()).find((n) => n.props?.label === label);
  assert.ok(n, label);
  return n.props;
};
const text = (value) => nodes(render()).some((n) => n.props?.children === value);
assert.equal(
  nodes(render()).filter((n) => n.type === 'Button' && n.props.label.endsWith(' 오늘만 제외'))
    .length,
  2,
);
assert.ok(text('오늘 제외됨'));
button('A 오늘만 제외').onPress();
button('제외 취소').onPress();
assert.equal(saves, 0);
button('A 오늘만 제외').onPress();
button('오늘만 제외 확인').onPress();
button('오늘만 제외 확인').onPress();
assert.equal(saves, 1);
assert.equal(input.task.updated_at, 'v1');
pending = true;
assert.equal(button('제외 취소').disabled, true);
rows = rows.map((t) => (t.id === 'A' ? { ...t, excluded_for_today: true, updated_at: 'v2' } : t));
callbacks.onSuccess();
callbacks.onSettled();
pending = false;
assert.ok(text('오늘 공부에서 제외했어요. 다음 공부 일정은 그대로예요.'));
button('B 오늘만 제외').onPress();
button('오늘만 제외 확인').onPress();
rows = rows.map((t) =>
  t.id === 'B' ? { ...t, status: 'IN_PROGRESS', started_at: 'now', updated_at: 'v2' } : t,
);
callbacks.onError(new api.TaskExclusionError('conflict'));
callbacks.onSettled();
await Promise.resolve();
await Promise.resolve();
assert.ok(text('공부 상태가 변경되어 최신 내용으로 다시 불러왔습니다.'));
assert.equal(reloads, 1);
rows.push(make('C'));
button('C 오늘만 제외').onPress();
assert.equal(button('제외 취소').disabled, false);
button('제외 취소').onPress();
button('C 오늘만 제외').onPress();
date = '2026-09-18';
button('오늘만 제외 확인').onPress();
await Promise.resolve();
assert.equal(saves, 2, 'Midnight rejected before RPC');
console.log(
  'PASS exclusion UI: eligibility, inline confirm/cancel, double-submit, saved badge, conflict recovery/re-edit, midnight',
);

const exception = load('src/features/learning/utils/exception-tasks.ts', {});
const excluded = make('excluded', { excluded_for_today: true });
assert.deepEqual(
  exception.prioritizeTodayTasks([excluded, make('normal')]).map((t) => t.id),
  ['normal'],
);
assert.equal(rules.editableTasks([excluded]).length, 0);
assert.throws(() => exception.buildConfirmations([excluded], {}, []), /오늘 제외/);
assert.equal(
  exception.unresolvedManualTasks(
    [{ ...excluded, daily_plans: { plan_date: '2026-09-16' } }],
    '2026-09-17',
  ).length,
  0,
);
const types = load('src/features/notifications/types.ts', {});
const planner = load('src/features/notifications/planner.ts', {
  '@/features/notifications/types': types,
});
const now = new Date(2026, 8, 17, 12).getTime();
const settings = {
  ...types.defaultSettings,
  notificationsEnabled: true,
  unfinishedReminderEnabled: true,
  unfinishedReminderTime: '20:00',
};
const snapshot = {
  userId: 'u',
  childId: 'c',
  date: '2026-09-17',
  plan: { day_type: 'STUDY' },
  tasks: [excluded],
  pending: [],
};
assert.equal(planner.planNotices(snapshot, settings, {}, now).scheduled.length, 0);
assert.equal(
  planner.planNotices(snapshot, settings, {}, now).immediate.length,
  0,
  'All excluded is not a completion',
);
const waiting = make('waiting', { status: 'CHILD_COMPLETED', parent_verified_at: null });
assert.equal(
  planner.planNotices({ ...snapshot, tasks: [excluded, waiting] }, settings, {}, now).immediate
    .length,
  1,
);
assert.equal(
  planner.planNotices({ ...snapshot, tasks: [excluded, make('normal')] }, settings, {}, now)
    .scheduled.length,
  1,
);
console.log(
  'PASS child/order/confirmation/one-time filtering and complete/unfinished notification rules',
);

const session = load('src/features/learning/screens/study-session-screen.tsx', {
  ...mocks,
  'expo-router': {
    useRouter: () => ({ replace() {} }),
    useLocalSearchParams: () => ({ taskId: 'excluded' }),
  },
  'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
  '@/design-system/tokens': { colors: {}, radius: {}, sizing: {}, spacing: {} },
  '@/shared/components/screen-message': { ScreenMessage: 'Message' },
  '@/features/learning/hooks/use-learning': {
    useDailyTask: () => ({ data: excluded }),
    useStartDailyTask: () => ({}),
    useCompleteDailyTask: () => ({}),
  },
});
assert.equal(session.StudySessionScreen().props.message, '오늘 제외된 공부예요.');
console.log('PASS direct study route has no start/complete CTA');

const manual = load('src/features/learning/components/manual-tasks-panel.tsx', {
  ...mocks,
  '@/shared/hooks/use-today': { useToday: () => '2026-09-17' },
  '@/features/learning/hooks/use-learning': {
    useDailyPlan: () => ({ data: { id: 'plan', target_minutes_snapshot: 60 } }),
    useDailyTasks: () => ({ data: [excluded, make('normal', { planned_minutes: 5 })] }),
    useUnresolvedManualTasks: () => ({ data: [] }),
    useAddManualDailyTask: () => ({}),
    useRescheduleManualTask: () => ({}),
    useSkipManualTask: () => ({}),
  },
});
slots.length = 0;
cursor = 0;
const total = nodes(manual.ManualTasksPanel({ childId: 'c' })).find(
  (n) => Array.isArray(n.props?.children) && n.props.children.includes('분 · 계획'),
);
assert.ok(total);
assert.ok(total.props.children.includes(5), 'Parent planned total excludes excluded task');
console.log('PASS parent time total excludes excluded task');

const { reconcile } = load('src/features/notifications/reconcile.ts', {
  '@/features/notifications/planner': planner,
  '@/features/notifications/types': types,
});
const cancelled = [];
await reconcile(
  {
    scheduled: async () => [{ id: 'ssaida:unfinished:c:2026-09-17', signature: 'old' }],
    presented: async () => [],
    cancel: async (id) => cancelled.push(id),
    schedule: async () => {
      throw new Error('All excluded must not notify');
    },
  },
  snapshot,
  settings,
  {},
  async () => {},
  () => true,
  now,
);
assert.deepEqual(cancelled, ['ssaida:unfinished:c:2026-09-17']);
console.log('PASS exclusion cancels already scheduled unfinished reminder');

const childScreen = load('src/features/learning/screens/child-today-screen.tsx', {
  ...mocks,
  'expo-router': { useRouter: () => ({ push() {} }) },
  '@/design-system/tokens': { colors: {}, radius: {}, sizing: {}, spacing: {} },
  '@/shared/components/screen-message': { ScreenMessage: 'Message' },
  '@/shared/hooks/use-today': { useToday: () => '2026-09-17' },
  '@/features/learning/utils/exception-tasks': exception,
  '@/features/learning/utils/visible-tasks': load(
    'src/features/learning/utils/visible-tasks.ts',
    {},
  ),
  '@/features/learning/hooks/use-learning': {
    useCurrentChild: () => ({ data: { id: 'c', name: 'child' } }),
    useEnsureDailyPlan: () => ({ mutate() {} }),
    useDailyPlan: () => ({ data: { id: 'plan', target_minutes_snapshot: 60 } }),
    useDailyTasks: () => ({ data: [excluded, make('normal', { planned_minutes: 5 })] }),
    useContinuingTasks: () => ({ data: [] }),
  },
});
slots.length = 0;
cursor = 0;
const childNodes = nodes(childScreen.ChildTodayScreen());
assert.equal(childNodes.filter((n) => n.props?.task).length, 1);
assert.equal(childNodes.find((n) => n.props?.task)?.props.task.id, 'normal');
assert.ok(
  childNodes.some(
    (n) =>
      Array.isArray(n.props?.children) &&
      n.props.children.includes('개 · 약 ') &&
      n.props.children.includes(5),
  ),
);
console.log('PASS child list/count/time omit excluded task');
