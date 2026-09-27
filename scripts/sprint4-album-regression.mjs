// Production API/TSX with deterministic transport and hook mocks, not a native renderer.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import ts from 'typescript';

function load(path, imports = {}) {
  const output = ts.transpileModule(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', output)(
    (id) => {
      if (!(id in imports)) throw new Error(`Missing import ${id}`);
      return imports[id];
    },
    module,
    module.exports,
  );
  return module.exports;
}
const utils = load('src/features/learning/utils/collection-album.ts');
const { buildCollectionAlbum } = utils;
const catalog = ['one', 'two', 'three', 'four'].map((id) => ({ id }));
let owned = [
  {
    collectible_catalog_id: 'one',
    revealed_at: '2026-09-27',
    status: 'COMPLETED',
    progress_points: 4,
    growth_goal_snapshot: 4,
  },
  {
    collectible_catalog_id: 'two',
    revealed_at: null,
    status: 'GROWING',
    progress_points: 1,
    growth_goal_snapshot: 4,
  },
  {
    collectible_catalog_id: 'three',
    revealed_at: null,
    status: 'COMPLETED',
    progress_points: 4,
    growth_goal_snapshot: 4,
  },
  {
    collectible_catalog_id: 'inactive',
    revealed_at: '2026-09-27',
    status: 'COMPLETED',
    progress_points: 1,
    growth_goal_snapshot: 1,
  },
];
const names = catalog.map((item) => ({
  ...item,
  name: item.id === 'one' ? '공개 공룡' : 'SECRET_IDENTITY',
}));
let album = buildCollectionAlbum(catalog, owned, names);
assert.equal(album.collected, 1);
assert.equal(album.total, 4);
assert.equal(album.isComplete, false);
assert.deepEqual(
  album.entries.map((item) => item.state),
  ['collected', 'growing', 'ready', 'locked'],
);
assert.equal(album.entries[1].progress, 25);
assert.ok(!JSON.stringify(album).includes('SECRET_IDENTITY'));
assert.equal(buildCollectionAlbum([], owned, names).isComplete, false);
assert.equal(buildCollectionAlbum([catalog[0]], owned, names).isComplete, true);

const jsx = (type, props) => ({ type, props });
const native = new Proxy(
  { StyleSheet: { create: (styles) => styles } },
  { get: (target, key) => target[key] ?? key },
);
const tokens = load('src/design-system/tokens.ts');
// Preserve JSX's third (key) argument: ordinary display mocks cannot detect duplicate keys.
let gardenTheme = 'DINO';
let pendingPoints = 0;
const keyedJsx = (type, props, key) => ({ type, props, key });
const { GardenScreen } = load('src/features/learning/screens/garden-screen.tsx', {
  'react/jsx-runtime': { jsx: keyedJsx, jsxs: keyedJsx },
  'react-native': native,
  '@/design-system/tokens': tokens,
  '@/features/learning/components/collection-album': { CollectionAlbum: 'Album' },
  '@/features/learning/components/collection-panel': { CollectionPanel: 'Panel' },
  '@/features/learning/components/theme-album-browser': { ThemeAlbumBrowser: 'Browser' },
  '@/features/learning/hooks/use-collection-album': { useCollectionAlbum: () => ({ data: album }) },
  '@/features/learning/hooks/use-learning': {
    useCurrentChild: () => ({
      data: {
        id: 'child',
        name: 'Child',
        selected_collection_theme_code: gardenTheme,
        pending_growth_points: pendingPoints,
      },
    }),
  },
  '@/shared/components/screen-message': { ScreenMessage: 'Message' },
});
for (const theme of ['DINO', 'GEM']) {
  gardenTheme = theme;
  const keys = GardenScreen()
    .props.children.filter((child) => child?.key != null)
    .map((child) => child.key);
  assert.equal(keys.length, 3);
  assert.equal(new Set(keys).size, keys.length, 'Garden siblings must have unique keys');
  assert.deepEqual(
    keys,
    [`child-${theme}`, `panel-${theme}`, `album-${theme}`],
    'Both reset on theme change',
  );
}
console.log('PASS GardenScreen unique sibling keys and theme-change reset');
const { CollectionAlbum } = load('src/features/learning/components/collection-album.tsx', {
  'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
  'react-native': native,
  '@/design-system/tokens': tokens,
});
function nodes(tree) {
  if (tree == null || typeof tree === 'boolean') return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (typeof tree !== 'object') return [tree];
  return [tree, ...nodes(tree.props?.children)];
}
const text = (tree) =>
  nodes(tree)
    .filter((node) => typeof node !== 'object')
    .join(' ');
assert.ok(!text(GardenScreen()).includes('잘 모아둔 성장'));
pendingPoints = 0.5;
assert.match(text(GardenScreen()), /잘 모아둔 성장 \+\s*0.5/);
assert.equal(
  nodes(GardenScreen()).find((node) => node.type === 'Browser').props.currentTheme,
  'GEM',
);
assert.match(text(GardenScreen()), /다음 아이템을 키울 때 사용돼요/);
assert.match(text(GardenScreen()), /잘 모아둔 성장 \+\s*0.5/, 'remount reads server pending');
pendingPoints = 0;
let tree = CollectionAlbum({ album });
for (const label of [
  '공개 공룡',
  '수집 완료',
  '키우는 중',
  '성장 25',
  '완성! 공개해보세요',
  '아직 만나지 못했어요',
]) {
  assert.ok(text(tree).replace(/\s+/g, ' ').includes(label), label);
}
assert.match(text(tree), /1\s*\/\s*4\s*개 모았어요/);
assert.ok(!JSON.stringify(tree).includes('SECRET_IDENTITY'), 'includes accessibility props');
assert.ok(!nodes(tree).some((node) => node.type === 'Image'), 'placeholder only');
assert.ok(
  text(CollectionAlbum({ album: buildCollectionAlbum([], owned, names) })).includes(
    '아직 준비된 아이템',
  ),
);
assert.ok(
  text(CollectionAlbum({ album: buildCollectionAlbum([catalog[0]], owned, names) })).includes(
    '모두 모았어요',
  ),
);

owned = owned.map((item) =>
  item.collectible_catalog_id === 'three' ? { ...item, revealed_at: '2026-09-27' } : item,
);
owned.push({
  collectible_catalog_id: 'four',
  status: 'GROWING',
  revealed_at: null,
  progress_points: 0,
  growth_goal_snapshot: 4,
});
album = buildCollectionAlbum(catalog, owned, names);
assert.equal(album.collected, 2);
assert.equal(album.entries[3].state, 'growing');
assert.equal(album.entries[3].name, '???');

// Inspect every request, including the name query: no hidden catalog identities fetched.
const requests = [];
let responses = [catalog, owned, [names[0], names[2]]];
const client = {
  from(table) {
    const request = { table, calls: [] };
    requests.push(request);
    const builder = {};
    for (const method of [
      'select',
      'eq',
      'order',
      'range',
      'in',
      'not',
      'single',
      'or',
      'limit',
      'maybeSingle',
    ]) {
      builder[method] = (...args) => {
        request.calls.push([method, ...args]);
        return builder;
      };
    }
    builder.then = (resolve, reject) =>
      Promise.resolve({ data: responses.shift(), error: null }).then(resolve, reject);
    return builder;
  },
};
const api = load('src/features/learning/api/collection-album-api.ts', {
  '@/features/learning/utils/collection-album': utils,
  '@/lib/supabase/client': { getSupabaseClient: () => client },
});
const fetched = await api.fetchCollectionAlbum('child', 'DINO');
assert.equal(fetched.collected, 2);
assert.equal(requests[0].calls[0][1], 'id,sort_order');
assert.deepEqual(requests[2].calls.find((call) => call[0] === 'in')[2], ['one', 'three']);
assert.ok(requests[0].calls.some((call) => call[1] === 'is_active' && call[2] === true));
assert.ok(requests[1].calls.some((call) => call[1] === 'child_id' && call[2] === 'child'));
responses = [[], []];
requests.length = 0;
assert.equal((await api.fetchCollectionAlbum('child', 'DINO')).isComplete, false);
assert.equal(requests.length, 2, 'empty catalog must not fetch names');
responses = [Array.from({ length: 500 }, (_, i) => ({ id: `id${i}` })), [{ id: 'last' }], []];
requests.length = 0;
assert.equal((await api.fetchCollectionAlbum('child', 'DINO')).total, 501, 'catalog pagination');

const learning = load('src/features/learning/api/learning-api.ts', {
  '@/features/learning/utils/exception-tasks': {},
  '@/lib/supabase/client': { getSupabaseClient: () => client },
});
responses = [{ id: 'current', status: 'GROWING' }];
requests.length = 0;
await learning.fetchCurrentCollectible('child', 'DINO');
assert.equal(requests[0].calls[0][1], '*', 'no pre-reveal name join');
client.rpc = async () => ({ error: null });
responses = [{ collectible_catalog: { name: '공개된 이름' } }];
requests.length = 0;
assert.equal(await learning.revealCollectible('current'), '공개된 이름');
assert.ok(requests[0].calls.some((call) => call[0] === 'not' && call[1] === 'revealed_at'));
globalThis.__DEV__ = false;
client.rpc = async () => ({ error: new Error('reveal rejected') });
requests.length = 0;
await assert.rejects(learning.revealCollectible('current'));
assert.equal(requests.length, 0, 'failed reveal must never fetch identity');

// Execute the actual reveal panel independently of unrelated parent-menu mocks.
const slots = [];
let cursor = 0;
let currentItem = {
  id: 'first',
  status: 'COMPLETED',
  revealed_at: null,
  progress_points: 1,
  growth_goal_snapshot: 1,
};
let revealSucceeds = false;
const invalidations = [];
const revealMutation = {
  isError: false,
  isPending: false,
  mutate(id, callbacks) {
    this.isError = !revealSucceeds;
    if (revealSucceeds) callbacks.onSuccess('공개 결과 이름');
  },
};
const { CollectionPanel } = load('src/features/learning/components/collection-panel.tsx', {
  '@/features/learning/components/growth-visual': { GrowthVisual: 'GrowthVisual' },
  react: {
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = initial;
      return [
        slots[index],
        (value) => {
          slots[index] = value;
        },
      ];
    },
  },
  'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
  'react-native': native,
  '@/design-system/tokens': tokens,
  '@tanstack/react-query': {
    useQueryClient: () => ({
      invalidateQueries: async (args) => {
        invalidations.push(args);
      },
    }),
  },
  '@/features/learning/hooks/use-learning': {
    learningKeys: { all: ['learning'], child: ['learning', 'child'] },
    useCurrentCollectible: () => ({ data: currentItem }),
    useSelectCollectionTheme: () => ({}),
    useRevealCollectible: () => revealMutation,
  },
});
const panelProps = {
  child: { id: 'child', selected_collection_theme_code: 'DINO' },
  albumState: 'incomplete',
};
const renderPanel = () => {
  cursor = 0;
  CollectionPanel(panelProps);
  cursor = 0;
  return CollectionPanel(panelProps);
};
const press = (view, label) =>
  nodes(view)
    .find((node) => node.type === 'Pressable' && text(node).includes(label))
    .props.onPress();
tree = renderPanel();
assert.ok(!text(tree).includes('공개 결과 이름'));
press(tree, '공개하기');
assert.ok(text(renderPanel()).includes('지금은 열어볼 수 없어요'));
revealSucceeds = true;
press(renderPanel(), '공개하기');
assert.ok(text(renderPanel()).includes('공개 결과 이름'));
assert.deepEqual(invalidations[0].queryKey, ['learning', 'collection-album', 'child']);
assert.deepEqual(
  invalidations[1].queryKey,
  ['learning', 'child'],
  'refresh pending after reveal without replacing success item',
);
press(renderPanel(), '정원으로');
assert.deepEqual(invalidations[2].queryKey, ['learning']);
currentItem = { ...currentItem, id: 'next', status: 'GROWING' };
assert.ok(!text(renderPanel()).includes('공개 결과 이름'));
currentItem = null;
panelProps.albumState = 'empty';
assert.ok(text(renderPanel()).includes('아직 준비된 아이템'));
assert.ok(!text(renderPanel()).includes('모두 만났어요'));
panelProps.albumState = 'complete';
assert.ok(text(renderPanel()).includes('모두 만났어요'));
console.log(
  'PASS actual CollectionPanel reveal failure/success/name clearing/album+pending refresh/empty state',
);
console.log(
  'PASS album states/UI/privacy/progress/empty-vs-complete/reveal/next-item/API pagination',
);
