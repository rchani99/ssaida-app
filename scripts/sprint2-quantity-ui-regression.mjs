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
  hooks.useUpdateDailyTaskQuantity();
  assert.equal(options.retry, false);
  assert.equal(options.networkMode, 'always');
  const mutation = new MutationObserver(client, options);
  const stopMutation = mutation.subscribe(() => {});
  let settled = false;
  let callbackError;
  let watchdog;
  try {
    const result = mutation.mutate(
      { task: { id: 'task', updated_at: 'v1' }, value: 10 },
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
          error instanceof api.TaskQuantityError &&
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
      `PASS real TanStack quantity ${outcome}: pending released, callbacks run, latest refetched`,
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
const make = (id, item_type = 'WORKBOOK', status = 'PLANNED', started_at = null) => ({
  id,
  item_type,
  status,
  started_at,
  updated_at: 'v1',
  daily_plan_id: 'plan',
  study_item_id: item_type === 'WORKBOOK' ? 'item' : null,
  name_snapshot: id,
  planned_start_page: item_type === 'WORKBOOK' ? 6 : null,
  planned_end_page: item_type === 'WORKBOOK' ? 10 : null,
  planned_minutes: 20,
  sort_order: 0,
});
let rows = [
  make('Workbook'),
  make('Activity', 'ACTIVITY'),
  ...['IN_PROGRESS', 'RETRY', 'CHILD_COMPLETED', 'PARENT_CONFIRMED', 'PARTIAL', 'SKIPPED'].map(
    (state) => make(state, 'WORKBOOK', state),
  ),
  make('Started planned', 'WORKBOOK', 'PLANNED', 'now'),
];
const rules = load('src/features/learning/utils/task-order.ts', {});
const api = load('src/features/learning/api/learning-api.ts', {
  '@/features/learning/utils/exception-tasks': {},
  '@/lib/supabase/client': {},
});
let callbacks;
let input;
let saves = 0;
let reloads = 0;
let pending = false;
let date = '2026-09-16';
const jsx = (type, props) => ({ type, props });
const panel = load('src/features/learning/components/task-quantity-panel.tsx', {
  react: {
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
  },
  'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
  'react-native': { Text: 'Text', View: 'View', AppState: {} },
  '@/features/learning/api/learning-api': api,
  '@/features/learning/utils/task-order': { ...rules, seoulDate: () => date },
  '@/features/learning/components/learning-controls': {
    LearningButton: 'Button',
    LearningField: 'Field',
    learningStyles: {},
  },
  '@/features/learning/hooks/use-learning': {
    useDailyPlan: () => ({ data: { id: 'plan' }, refetch: async () => ({ data: { id: 'plan' } }) }),
    useDailyTasks: () => ({
      data: rows,
      refetch: async () => {
        reloads++;
        return { data: rows, isError: false };
      },
    }),
    useStudyItems: () => ({ data: [{ id: 'item', workbook_last_page: 100 }] }),
    useUpdateDailyTaskQuantity: () => ({
      isPending: pending,
      mutate: (value, options) => {
        saves++;
        input = value;
        callbacks = options;
      },
    }),
  },
});
const render = () => {
  cursor = 0;
  return panel.TaskQuantityPanel({ childId: 'child' });
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
const text = (value) =>
  nodes(render()).some(
    (n) =>
      (Array.isArray(n.props?.children) ? n.props.children.join('') : n.props?.children) === value,
  );
assert.equal(
  nodes(render()).filter((n) => n.type === 'Button' && n.props.label.endsWith(' 분량 수정')).length,
  2,
);
button('Workbook 분량 수정').onPress();
assert.ok(text('시작 6쪽 (변경할 수 없어요)'));
assert.equal(nodes(render()).filter((n) => n.type === 'Field').length, 1);
const cardFor = (name) =>
  nodes(render()).find(
    (n) =>
      n.type === 'View' &&
      Array.isArray(n.props.children) &&
      n.props.children.some((child) => child?.type === 'Text' && child.props.children === name),
  );
assert.equal(nodes(cardFor('Workbook')).filter((n) => n.type === 'Field').length, 1);
assert.equal(nodes(cardFor('Activity')).filter((n) => n.type === 'Field').length, 0);
button('Activity 분량 수정').onPress();
assert.equal(nodes(render()).filter((n) => n.type === 'Field').length, 1, 'One inline editor');
assert.equal(nodes(cardFor('Workbook')).filter((n) => n.type === 'Field').length, 0);
assert.equal(nodes(cardFor('Activity')).filter((n) => n.type === 'Field').length, 1);
button('Workbook 분량 수정').onPress();
for (const invalid of ['5', '101', '7.5', '']) {
  button('오늘 끝 페이지').onChangeText(invalid);
  button('분량 저장').onPress();
  assert.equal(saves, 0);
}
button('오늘 끝 페이지').onChangeText('8');
button('분량 저장').onPress();
button('분량 저장').onPress();
assert.equal(saves, 1);
assert.equal(input.value, 8);
assert.equal(input.task.planned_start_page, 6);
pending = true;
assert.equal(button('분량 수정 취소').disabled, true);
callbacks.onSuccess();
callbacks.onSettled();
pending = false;
assert.ok(text('오늘 공부 분량을 저장했어요.'));
button('Activity 분량 수정').onPress();
for (const invalid of ['0', '32768', '1.5']) {
  button('오늘 공부 시간 (분)').onChangeText(invalid);
  button('분량 저장').onPress();
  assert.equal(saves, 1);
}
button('오늘 공부 시간 (분)').onChangeText('30');
button('분량 저장').onPress();
assert.equal(saves, 2);
rows = rows.map((t) =>
  t.id === 'Activity' ? { ...t, status: 'IN_PROGRESS', started_at: 'now', updated_at: 'v2' } : t,
);
callbacks.onError(new api.TaskQuantityError('conflict'));
callbacks.onSettled();
await Promise.resolve();
await Promise.resolve();
assert.ok(text('공부 상태가 변경되어 최신 내용으로 다시 불러왔습니다.'));
assert.equal(reloads, 1);
assert.ok(!nodes(render()).some((n) => n.props?.label === 'Activity 분량 수정'));
button('Workbook 분량 수정').onPress();
assert.equal(button('분량 수정 취소').disabled, false);
button('분량 수정 취소').onPress();
assert.ok(!nodes(render()).some((n) => n.props?.label === '분량 저장'));
button('Workbook 분량 수정').onPress();
date = '2026-09-17';
button('분량 저장').onPress();
await Promise.resolve();
assert.equal(saves, 2);
console.log(
  'PASS quantity production UI handlers: eligibility, fixed start, bounds, save/cancel, duplicate guard, conflict recovery/re-edit, Seoul midnight',
);
date = '2026-09-16';
button('Workbook 분량 수정').onPress();
rows = rows.map((t) => (t.id === 'Workbook' ? { ...t, excluded_for_today: true } : t));
assert.equal(nodes(render()).filter((n) => n.type === 'Field').length, 0);
assert.ok(text('공부 상태가 바뀌었어요. 최신 목록을 다시 불러와 주세요.'));
assert.ok(button('최신 분량 불러오기'));
console.log('PASS inline quantity: removed/excluded draft does not leave an editable orphan');
