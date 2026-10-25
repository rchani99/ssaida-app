import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { MutationObserver, QueryClient, QueryObserver } from '@tanstack/react-query';
import ts from 'typescript';

// Exercise the actual hook options with TanStack's mutation/query lifecycle.
// API writes and reads are local fixtures; no Supabase client is loaded.
const source = readFileSync(
  new URL('../src/features/learning/hooks/use-learning.ts', import.meta.url),
  'utf8',
);
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
for (const kind of ['create', 'update']) {
  for (const refetch of ['slow', 'failed', 'immediate']) {
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: Infinity },
        mutations: { gcTime: Infinity },
      },
    });
    const key = ['learning', 'study-items', 'fixture-child', false];
    client.setQueryData(key, [{ id: 'fixture-book', updated_at: 'old' }]);
    let fetches = 0;
    let resolveRead;
    let rejectRead;
    let writes = 0;
    let closes = 0;
    let errors = 0;
    let settled = 0;
    const query = new QueryObserver(client, {
      queryKey: key,
      staleTime: Infinity,
      queryFn: () => {
        fetches++;
        if (refetch === 'immediate') {
          return Promise.resolve([{ id: 'fixture-book', updated_at: 'new' }]);
        }
        return new Promise((resolve, reject) => {
          resolveRead = resolve;
          rejectRead = reject;
        });
      },
    });
    const stopQuery = query.subscribe(() => {});
    let options;
    const fixtureWrite = async () => {
      writes++;
    };
    const imports = {
      '@tanstack/react-query': {
        useQueryClient: () => client,
        useMutation: (value) => {
          options = value;
        },
      },
      '@/features/learning/api/learning-api': {
        createStudyItem: fixtureWrite,
        updateStudyItem: fixtureWrite,
      },
    };
    const module = { exports: {} };
    new Function('require', 'module', 'exports', output)(
      (id) => {
        assert.ok(id in imports, id);
        return imports[id];
      },
      module,
      module.exports,
    );
    module.exports[kind === 'create' ? 'useCreateStudyItem' : 'useUpdateStudyItem']();
    const mutation = new MutationObserver(client, options);
    const stopMutation = mutation.subscribe(() => {});
    let watchdog;
    try {
      await Promise.race([
        mutation.mutate(
          {},
          {
            onSuccess: () => closes++,
            onError: () => errors++,
            onSettled: () => settled++,
          },
        ),
        new Promise((_, reject) => {
          watchdog = setTimeout(() => reject(new Error('Save waited for list refetch')), 1000);
        }),
      ]);
      assert.equal(writes, 1);
      assert.equal(fetches, 1);
      assert.equal(closes, 1, 'Successful write closes before slow refresh settles');
      assert.equal(settled, 1, 'Submission guard can release');
      assert.equal(mutation.getCurrentResult().isPending, false);
      if (refetch === 'slow') resolveRead([{ id: 'fixture-book', updated_at: 'new' }]);
      if (refetch === 'failed') rejectRead(new Error('List refresh failed'));
      await new Promise((resolve) => setTimeout(resolve, 0));
      assert.equal(closes, 1, 'Late refresh must not close a later form session again');
      assert.equal(errors, 0, 'Refresh failure cannot be presented as write failure');
      if (refetch === 'failed') assert.equal(query.getCurrentResult().isError, true);
      else assert.equal(client.getQueryData(key)[0].updated_at, 'new');
      console.log(
        `PASS ${kind}: ${refetch} list refresh does not delay or reverse saved-form closure`,
      );
    } finally {
      clearTimeout(watchdog);
      stopMutation();
      stopQuery();
      client.clear();
    }
  }
}
