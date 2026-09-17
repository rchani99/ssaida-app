import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { MutationObserver, QueryClient, QueryObserver } from '@tanstack/react-query';
import ts from 'typescript';

function load(path, mocks, timer = setTimeout) {
  const module = { exports: {} };
  const output = ts.transpileModule(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
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
                  outcome === 'conflict' ? { code: '40001', message: 'private SQL detail' } : null,
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
  hooks.useReorderDailyTasks();
  assert.equal(options.retry, false);
  assert.equal(options.networkMode, 'always');
  const mutation = new MutationObserver(client, options);
  const stopMutation = mutation.subscribe(() => {});
  let settled = false;
  let callbackError;
  let watchdog;
  try {
    const result = mutation.mutate(
      { planId: 'plan', tasks: [] },
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
          error instanceof api.TaskOrderError &&
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
      `PASS real TanStack reorder ${outcome}: pending released, callbacks run, latest refetched`,
    );
  } finally {
    clearTimeout(watchdog);
    stopMutation();
    stopQuery();
    client.clear();
  }
}
