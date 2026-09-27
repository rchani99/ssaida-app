import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { MutationObserver, QueryClient, QueryObserver } from '@tanstack/react-query';
import ts from 'typescript';

import { uiMocks } from './ui-regression-mocks.mjs';

function load(path, mocks, timer = setTimeout) {
  const module = { exports: {} };
  new Function(
    'require',
    'module',
    'exports',
    '__DEV__',
    'setTimeout',
    ts.transpileModule(readFileSync(new URL('../' + path, import.meta.url), 'utf8'), {
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
    false,
    timer,
  );
  return module.exports;
}
const proposal = {
  task_id: 'task',
  context_token: 'server-token',
  kind: 'GAP',
  action: 'ADJUST',
  confirmed_progress: 93,
  old_start: 95,
  old_end: 99,
  new_start: 94,
  new_end: 98,
};
for (const outcome of ['success', 'PT409', 'PT412', 'PT422', 'PT423', 'network', 'timeout']) {
  let signal, name, args;
  const api = load(
    'src/features/learning/api/quantity-resolution-api.ts',
    {
      '@/lib/supabase/client': {
        getSupabaseClient: () => ({
          rpc: (rpc, payload) => {
            name = rpc;
            args = payload;
            return {
              abortSignal: (value) => {
                signal = value;
                if (outcome === 'timeout') return new Promise(() => {});
                if (outcome === 'network')
                  return Promise.reject(new Error('private network detail'));
                return Promise.resolve(
                  outcome === 'success'
                    ? { data: proposal, error: null }
                    : { data: null, error: { code: outcome, message: 'private SQL detail' } },
                );
              },
            };
          },
        }),
      },
    },
    (fn, delay) => {
      assert.equal(delay, 15000);
      return setTimeout(fn, outcome === 'timeout' ? 5 : delay);
    },
  );
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { gcTime: Infinity },
    },
  });
  client.setQueryData(['learning', 'review'], ['old']);
  let refreshes = 0,
    finishRefresh;
  const observer = new QueryObserver(client, {
    queryKey: ['learning', 'review'],
    staleTime: Infinity,
    queryFn: () => {
      refreshes++;
      return new Promise((resolve) => {
        finishRefresh = resolve;
      });
    },
  });
  const stop = observer.subscribe(() => {});
  let options;
  const hooks = load('src/features/learning/hooks/use-quantity-resolution.ts', {
    '@tanstack/react-query': {
      useQueryClient: () => client,
      useMutation: (v) => {
        options = v;
      },
    },
    '@/features/learning/api/quantity-resolution-api': api,
    '@/features/learning/hooks/use-learning': { learningKeys: { all: ['learning'] } },
  });
  hooks.useResolveQuantityConflict();
  assert.equal(options.retry, false);
  assert.equal(options.networkMode, 'always');
  const mutation = new MutationObserver(client, options);
  const unsubscribe = mutation.subscribe(() => {});
  let settled = false,
    callError,
    callSuccess = false;
  let watchdog;
  try {
    await Promise.race([
      mutation
        .mutate(proposal, {
          onSuccess: () => {
            callSuccess = true;
          },
          onError: (error) => {
            callError = error;
          },
          onSettled: () => {
            settled = true;
          },
        })
        .catch(() => {}),
      new Promise((_, reject) => {
        watchdog = setTimeout(() => reject(new Error('Mutation trapped by refetch')), 2000);
      }),
    ]);
    assert.equal(name, 'resolve_quantity_conflict');
    assert.deepEqual(args, {
      target_daily_task_id: 'task',
      expected_context_token: 'server-token',
    });
    assert.ok(settled);
    assert.equal(mutation.getCurrentResult().isPending, false);
    assert.equal(refreshes, 1, 'Latest list refetched on success and failure');
    assert.equal(callSuccess, outcome === 'success');
    if (outcome !== 'success') {
      assert.ok(callError instanceof api.QuantityResolutionError);
      assert.doesNotMatch(callError.message, /private|PT409|SQL/);
    }
    if (outcome === 'timeout') assert.ok(signal.aborted);
    finishRefresh([]);
    if (outcome === 'success') {
      await api.previewQuantityResolution('task');
      assert.equal(name, 'preview_quantity_conflict_resolution');
      assert.deepEqual(args, { target_daily_task_id: 'task' });
    }
  } finally {
    clearTimeout(watchdog);
    unsubscribe();
    stop();
    client.clear();
  }
  console.log(
    'PASS actual API/mutation: ' + outcome + ', pending released, call-level callbacks and refetch',
  );
}

const api = load('src/features/learning/api/quantity-resolution-api.ts', {
  '@/lib/supabase/client': {},
});
const slots = [];
let cursor = 0,
  previewCallbacks,
  saveCallbacks,
  previews = 0,
  saves = 0,
  busy = false,
  result;
let task = {
  id: 'task',
  source_type: 'AUTO',
  item_type: 'WORKBOOK',
  status: 'PLANNED',
  started_at: null,
  quantity_conflict: 'GAP',
  daily_plans: { plan_date: '2026-09-18' },
};
const jsx = (type, props) => ({ type, props });
const component = load('src/features/learning/components/quantity-conflict-resolution.tsx', {
  react: {
    useState(initial) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = initial;
      return [
        slots[i],
        (v) => {
          slots[i] = v;
        },
      ];
    },
    useRef(initial) {
      const i = cursor++;
      return slots[i] ?? (slots[i] = { current: initial });
    },
  },
  'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
  'react-native': { Text: 'Text', View: 'View' },
  '@/features/learning/api/quantity-resolution-api': api,
  '@/features/learning/components/learning-controls': {
    LearningButton: 'Button',
    learningStyles: {},
  },
  '@/features/learning/utils/task-order': { seoulDate: () => '2026-09-18' },
  '@/features/learning/hooks/use-quantity-resolution': {
    usePreviewQuantityResolution: () => ({
      isPending: busy,
      mutate: (id, callbacks) => {
        assert.equal(id, 'task');
        previews++;
        previewCallbacks = callbacks;
      },
    }),
    useResolveQuantityConflict: () => ({
      isPending: busy,
      mutate: (input, callbacks) => {
        assert.equal(input.context_token, 'server-token');
        saves++;
        saveCallbacks = callbacks;
      },
    }),
  },
});
const render = () => {
  cursor = 0;
  return component.QuantityConflictResolution({
    task,
    item: { workbook_last_completed_page: 93 },
    onResolved: (v) => {
      result = v;
    },
  });
};
const nodes = (n) =>
  !n || typeof n !== 'object'
    ? []
    : Array.isArray(n)
      ? n.flatMap(nodes)
      : [n, ...nodes(n.props?.children)];
const button = (label) => {
  const n = nodes(render()).find((n) => n.props?.label === label);
  assert.ok(n, label);
  return n.props;
};
button('진도에 맞추기').onPress();
button('진도에 맞추기').onPress();
assert.equal(previews, 1);
previewCallbacks.onSuccess(proposal);
previewCallbacks.onSettled();
assert.match(JSON.stringify(render()), /95~99쪽 → 94~98쪽/);
assert.equal(saves, 0, 'Preview alone never writes');
button('진도 맞추기 취소').onPress();
assert.equal(saves, 0);
button('진도에 맞추기').onPress();
previewCallbacks.onSuccess(proposal);
previewCallbacks.onSettled();
button('진도 맞추기 적용').onPress();
button('진도 맞추기 적용').onPress();
assert.equal(saves, 1);
busy = true;
assert.equal(button('진도 맞추기 취소').disabled, true);
saveCallbacks.onError(new api.QuantityResolutionError('conflict'));
saveCallbacks.onSettled();
busy = false;
assert.match(JSON.stringify(render()), /공부 상태가 변경/);
button('진도에 맞추기').onPress();
previewCallbacks.onSuccess({
  ...proposal,
  action: 'EXCLUDE',
  kind: 'FULL_OVERLAP',
  confirmed_progress: 99,
});
previewCallbacks.onSettled();
assert.match(JSON.stringify(render()), /오늘 실행 목록에서 제외할까요/);
button('진도 맞추기 적용').onPress();
saveCallbacks.onSuccess({ ...proposal, action: 'EXCLUDE' });
saveCallbacks.onSettled();
assert.equal(result.action, 'EXCLUDE');
for (const status of [
  'IN_PROGRESS',
  'CHILD_COMPLETED',
  'RETRY',
  'PARENT_CONFIRMED',
  'PARTIAL',
  'SKIPPED',
]) {
  task = { ...task, status };
  assert.equal(nodes(render()).filter((n) => n.type === 'Button').length, 0);
}
task = { ...task, status: 'PLANNED', daily_plans: { plan_date: '2026-09-17' } };
assert.equal(nodes(render()).filter((n) => n.type === 'Button').length, 0);
console.log(
  'PASS resolution UI: preview/cancel/apply, duplicate guard, stale recovery/retry, exclusion copy, started/history protection',
);
