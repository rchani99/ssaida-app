import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { MutationObserver, QueryClient, QueryObserver } from '@tanstack/react-query';
import ts from 'typescript';

const source = readFileSync(
  new URL('../src/features/learning/hooks/use-learning.ts', import.meta.url),
  'utf8',
);

// Only the React hook entry points and RPC transport are substituted. Invalidation,
// active query refetching and mutation callback ordering use the real TanStack core.
async function verifyRevealOrdering(hookSource, fail = false) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false, gcTime: Infinity },
    },
  });
  const key = ['learning', 'collectible', 'child', 'DINO'];
  const original = { id: 'revealed', name: 'Revealed name' };
  client.setQueryData(key, original);
  let fetches = 0;
  // fetches is test instrumentation, not an input that identifies server data.
  // eslint-disable-next-line @tanstack/query/exhaustive-deps
  const query = new QueryObserver(client, {
    queryKey: key,
    staleTime: Infinity,
    queryFn: async () => {
      fetches++;
      return { id: 'next', name: 'Hidden next name' };
    },
  });
  const unsubscribeQuery = query.subscribe(() => {});
  let options;
  const output = ts.transpileModule(hookSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', output)(
    (id) => {
      if (id === '@tanstack/react-query')
        return {
          useQueryClient: () => client,
          useMutation: (value) => {
            options = value;
          },
        };
      if (id === '@/features/learning/api/learning-api')
        return {
          revealCollectible: async () => {
            if (fail) throw new Error('Test failure');
          },
        };
      throw new Error(`Unexpected import: ${id}`);
    },
    module,
    module.exports,
  );
  module.exports.useRevealCollectible();
  const mutation = new MutationObserver(client, options);
  const unsubscribeMutation = mutation.subscribe(() => {});
  let displayedName = null;
  try {
    const result = mutation.mutate(original.id, {
      onSuccess: () => {
        // The panel may show the success name only while the old id is still current.
        if (client.getQueryData(key).id === original.id) displayedName = original.name;
      },
    });
    if (fail) {
      await assert.rejects(result, /Test failure/);
      assert.equal(displayedName, null);
      assert.equal(fetches, 0);
      return;
    }
    await result;
    assert.equal(
      displayedName,
      original.name,
      'Success callback must run before next collectible replaces the current one',
    );
    assert.equal(fetches, 0, 'Reveal success must not immediately refetch an active query');
    assert.equal(client.getQueryState(key).isInvalidated, true);
    // Same strategy as the panel's "정원으로" button.
    await client.invalidateQueries({ queryKey: module.exports.learningKeys.all });
    assert.equal(fetches, 1);
    assert.equal(client.getQueryData(key).id, 'next');
  } finally {
    unsubscribeMutation();
    unsubscribeQuery();
    client.clear();
  }
}

await verifyRevealOrdering(source);
await verifyRevealOrdering(source, true);
// Negative control: prove this guard detects removal of refetchType, without editing source files.
const withoutGuard = source.replace(", refetchType: 'none'", '');
assert.notEqual(withoutGuard, source);
await assert.rejects(verifyRevealOrdering(withoutGuard), { name: 'AssertionError' });
console.log(
  'PASS real TanStack mutation ordering: success name retained, failure hidden, full invalidate loads next; removing refetchType is detected',
);
