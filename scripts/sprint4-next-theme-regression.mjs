import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { MutationObserver, QueryClient, QueryObserver } from '@tanstack/react-query';
import ts from 'typescript';

const load = (path, imports) => {
  const module = { exports: {} };
  const js = ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  new Function('require', 'module', 'exports', js)(
    (id) => {
      assert.ok(id in imports, id);
      return imports[id];
    },
    module,
    module.exports,
  );
  return module.exports;
};
const jsx = (type, props, key) => ({ type, props, key });
const native = new Proxy(
  { StyleSheet: { create: (s) => s } },
  { get: (obj, key) => obj[key] ?? key },
);
const common = {
  'react/jsx-runtime': { jsx, jsxs: jsx },
  'react-native': native,
  '@/design-system/tokens': load('src/design-system/tokens.ts', {}),
};
const nodes = (t) =>
  Array.isArray(t)
    ? t.flatMap(nodes)
    : t && typeof t === 'object'
      ? [t, ...nodes(t.props?.children)]
      : [];
const text = (t) =>
  typeof t === 'string'
    ? t
    : Array.isArray(t)
      ? t.map(text).join('')
      : t && typeof t === 'object'
        ? text(t.props?.children)
        : '';
let open = false;
let selected;
let configs;
const mutation = {
  isPending: false,
  isError: false,
  mutate: (code) => {
    selected = code;
  },
  reset: () => {
    mutation.isError = false;
  },
};
const results = ['DINO', 'GEM', 'ROBOT', 'DOLL', 'COIN', 'PLANT'].map((code) => ({
  data: {
    total: code === 'ROBOT' ? 0 : 3,
    isComplete: code === 'DINO' || code === 'COIN',
    entries: [],
  },
  refetch: async () => {},
}));
const { NextThemePanel } = load('src/features/learning/components/next-theme-panel.tsx', {
  ...common,
  react: {
    useState: () => [
      open,
      (value) => {
        open = value;
      },
    ],
  },
  '@tanstack/react-query': {
    useQueries: ({ queries }) => {
      configs = queries;
      return results;
    },
  },
  '@/features/learning/api/collection-album-api': { fetchCollectionAlbum: async () => {} },
  '@/features/learning/hooks/use-learning': { useSelectCollectionTheme: () => mutation },
});
const render = () => NextThemePanel({ childId: 'child', themeCode: 'DINO' });
const button = (label) =>
  nodes(render()).find(
    (n) => n.type === 'Pressable' && (text(n) === label || n.props.accessibilityLabel === label),
  );
assert.match(text(render()), /공룡 도감 완성!/);
assert.ok(configs.every((q) => !q.enabled));
button('다음 테마 고르기').props.onPress();
assert.ok(button('공룡 · 완료').props.disabled);
assert.ok(button('동전 · 완료').props.disabled);
assert.ok(button('로봇 · 준비 중').props.disabled);
assert.equal(button('보석 · 새로 키우기').props.disabled, false);
assert.ok(configs.every((q) => q.enabled));
button('보석 · 새로 키우기').props.onPress();
assert.equal(selected, 'GEM');
mutation.isPending = true;
assert.ok(button('보석 · 새로 키우기').props.disabled);
mutation.isPending = false;
mutation.isError = true;
assert.match(text(render()), /테마를 선택하지 못했어요/);
button('취소').props.onPress();
assert.equal(open, false);
assert.equal(mutation.isError, false);

let complete = false;
let theme = 'DINO';
let error = false;
const { GardenScreen } = load('src/features/learning/screens/garden-screen.tsx', {
  ...common,
  '@/features/learning/components/collection-panel': { CollectionPanel: 'Panel' },
  '@/features/learning/components/collection-album': { CollectionAlbum: 'Album' },
  '@/features/learning/components/next-theme-panel': { NextThemePanel: 'Next' },
  '@/features/learning/hooks/use-collection-album': {
    useCollectionAlbum: () => ({ data: { total: 3, isComplete: complete }, isError: error }),
  },
  '@/features/learning/hooks/use-learning': {
    useCurrentChild: () => ({
      data: { id: 'child', name: 'child', selected_collection_theme_code: theme },
    }),
  },
  '@/shared/components/screen-message': { ScreenMessage: 'Message' },
});
assert.ok(!nodes(GardenScreen()).some((n) => n.type === 'Next'));
complete = true;
assert.equal(nodes(GardenScreen()).find((n) => n.type === 'Next').props.themeCode, 'DINO');
error = true;
assert.ok(!nodes(GardenScreen()).some((n) => n.type === 'Next'));
error = false;
complete = false;
theme = 'GEM';
// After RPC invalidation and on a new mount, server child selection drives the garden.
for (let i = 0; i < 2; i++) {
  assert.equal(
    nodes(GardenScreen()).find((n) => n.type === 'Panel').props.child
      .selected_collection_theme_code,
    'GEM',
  );
  assert.ok(!nodes(GardenScreen()).some((n) => n.type === 'Next'));
}
console.log(
  'PASS next-theme UI: completion gate, cards, empty/completed disabled, mutation/error/cancel, server-selected garden on remount',
);

// Real TanStack mutation/refetch contract; only RPC transport and React entry points are mocked.
for (const reject of [false, true]) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false, gcTime: Infinity },
    },
  });
  let serverChild = { selected_collection_theme_code: 'DINO', pending_growth_points: 1.25 };
  const childKey = ['learning', 'child'];
  client.setQueryData(childKey, serverChild);
  const observer = new QueryObserver(client, {
    queryKey: childKey,
    staleTime: Infinity,
    queryFn: async () => serverChild,
  });
  const unsubscribe = observer.subscribe(() => {});
  let options;
  const hooks = load('src/features/learning/hooks/use-learning.ts', {
    '@tanstack/react-query': {
      useQueryClient: () => client,
      useMutation: (value) => {
        options = value;
      },
    },
    '@/features/learning/api/learning-api': {
      selectCollectionTheme: async (code) => {
        if (reject) throw new Error('current theme incomplete');
        serverChild = { selected_collection_theme_code: code, pending_growth_points: 0.25 };
      },
    },
  });
  hooks.useSelectCollectionTheme();
  const mutationObserver = new MutationObserver(client, options);
  try {
    if (reject) {
      await assert.rejects(mutationObserver.mutate('GEM'), /incomplete/);
      assert.equal(client.getQueryData(childKey).selected_collection_theme_code, 'DINO');
    } else {
      await mutationObserver.mutate('GEM');
      assert.deepEqual(client.getQueryData(childKey), serverChild);
      assert.equal(client.getQueryData(childKey).pending_growth_points, 0.25);
      // A fresh client fetch (app restart) reads the persisted server choice, no local override.
      const restarted = new QueryClient();
      assert.equal(
        (await restarted.fetchQuery({ queryKey: childKey, queryFn: async () => serverChild }))
          .selected_collection_theme_code,
        'GEM',
      );
      restarted.clear();
    }
    assert.equal(mutationObserver.getCurrentResult().isPending, false);
  } finally {
    unsubscribe();
    client.clear();
  }
}
console.log(
  'PASS real theme mutation/refetch: success, rejection, pending result refresh and fresh client selection',
);
