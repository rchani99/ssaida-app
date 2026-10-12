import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import ts from 'typescript';

const jsx = (type, props, key) => ({ type, props, key });
const load = (path, imports = {}) => {
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
const { collectionThemes: themes } = load('src/features/learning/utils/collection-themes.ts');
let state = [];
let cursor = 0;
let queries;
let selected;
let callbacks;
let retries = 0;
const mutation = {
  isPending: false,
  isError: false,
  mutate: (code, options) => {
    selected = code;
    callbacks = options;
  },
  reset: () => {
    mutation.isError = false;
  },
};
const completed = { total: 6, collected: 6, isComplete: true, entries: [{ state: 'collected' }] };
const current = { total: 6, collected: 2, isComplete: false, entries: [{ state: 'growing' }] };
const partial = { total: 6, collected: 1, isComplete: false, entries: [{ state: 'collected' }] };
const results = themes.map(([code]) => ({
  data:
    code === 'DINO'
      ? completed
      : code === 'DOLL'
        ? current
        : code === 'GEM'
          ? partial
          : { total: 0, collected: 0, entries: [], isComplete: false },
  isError: false,
  refetch: async () => {
    retries++;
  },
}));
const { ThemeAlbumBrowser } = load('src/features/learning/components/theme-album-browser.tsx', {
  'react/jsx-runtime': { jsx, jsxs: jsx },
  react: {
    useState: (initial) => {
      const i = cursor++;
      if (!(i in state)) state[i] = initial;
      return [
        state[i],
        (value) => {
          state[i] = value;
        },
      ];
    },
  },
  'react-native': {
    Pressable: 'Button',
    View: 'View',
    Text: 'Text',
    Modal: 'Modal',
    ScrollView: 'Scroll',
    StyleSheet: { create: (value) => value },
  },
  'react-native-safe-area-context': { SafeAreaView: 'SafeArea' },
  '@tanstack/react-query': {
    useQueries: ({ queries: configs }) => {
      queries = configs;
      return results;
    },
  },
  '@/design-system/tokens': {
    childCollectionTokens: {},
    colors: {},
    radius: {},
    sizing: {},
    spacing: {},
  },
  '@/features/learning/api/collection-album-api': {
    fetchCollectionAlbum: (child, theme) => ({ child, theme }),
  },
  '@/features/learning/components/collection-album': { CollectionAlbum: 'Album' },
  '@/features/learning/hooks/use-learning': { useSelectCollectionTheme: () => mutation },
  '@/features/learning/utils/collection-themes': { collectionThemes: themes },
});
const nodes = (tree) =>
  Array.isArray(tree)
    ? tree.flatMap(nodes)
    : tree && typeof tree === 'object'
      ? [tree, ...nodes(tree.props?.children)]
      : [];
const text = (tree) =>
  Array.isArray(tree)
    ? tree.map(text).join('')
    : tree && typeof tree === 'object'
      ? text(tree.props?.children)
      : (tree ?? '');
const render = () => {
  cursor = 0;
  return ThemeAlbumBrowser({ childId: 'child', currentTheme: 'DOLL', isComplete: false });
};
const button = (label) =>
  nodes(render()).find(
    (n) => n.type === 'Button' && (n.props.accessibilityLabel === label || text(n) === label),
  );
const press = (label) => {
  const node = button(label);
  assert.ok(node, label);
  assert.ok(!node.props.disabled, label);
  node.props.onPress();
};
const albums = () => nodes(render()).filter((n) => n.type === 'Album');

assert.equal(nodes(render()).filter((n) => n.type === 'Button').length, 1, 'One garden entry');
assert.equal(albums().length, 0);
assert.ok(queries.every((q) => !q.enabled));
press('인형 테마 · 테마와 도감 열기');
assert.equal(nodes(render()).filter((n) => n.type === 'Modal').length, 1);
assert.equal(albums().length, 1);
assert.equal(albums()[0].props.album, current);
assert.equal(albums()[0].props.title, '인형 도감');
assert.ok(queries.every((q) => q.enabled));
assert.deepEqual(queries[0].queryFn(), { child: 'child', theme: 'DINO' });
assert.deepEqual(queries[3].queryKey, ['learning', 'collection-album', 'child', 'DOLL']);
assert.ok(!button('인형 테마 키우기'));

press('공룡 도감 · 6/6 · 완료');
assert.equal(albums().length, 1);
assert.equal(albums()[0].props.album, completed);
assert.ok(!button('공룡 테마 키우기'), 'Completed themes remain viewable without a selection CTA');
assert.equal(selected, undefined, 'Browsing never changes the theme');
press('로봇 도감 · 준비 중');
assert.ok(!button('로봇 테마 키우기'));
press('보석 도감 · 1/6');
assert.equal(albums().length, 1);
assert.equal(albums()[0].props.album, partial);
assert.equal(selected, undefined);
press('보석 테마 키우기');
assert.equal(selected, 'GEM', 'Only explicit growing action changes the theme');
mutation.isPending = true;
assert.ok(button('보석 테마 키우기').props.disabled);
assert.ok(button('테마와 도감 닫기').props.disabled);
assert.ok(button('공룡 도감 · 6/6 · 완료').props.disabled);
nodes(render())
  .find((n) => n.type === 'Modal')
  .props.onRequestClose();
assert.equal(albums().length, 1, 'Hardware back cannot hide an in-flight selection');
mutation.isPending = false;
mutation.isError = true;
assert.match(text(render()), /테마를 바꾸지 못했어요/);
assert.equal(albums()[0].props.album, partial);
press('보석 테마 키우기');
callbacks.onSuccess();
assert.equal(albums().length, 0);
press('인형 테마 · 테마와 도감 열기');
assert.equal(albums()[0].props.album, current, 'Reopening starts from the server-selected theme');
press('보석 도감 · 1/6');
results[1].isError = true;
assert.equal(albums().length, 0);
assert.ok(!button('보석 테마 키우기'), 'An errored cached album cannot be selected');
press('다시 불러오기');
assert.equal(retries, 1);
results[1].isError = false;
press('테마와 도감 닫기');
render();
assert.ok(queries.every((q) => !q.enabled));
state = [];
press('인형 테마 · 테마와 도감 열기');
assert.equal(albums()[0].props.album, current);
assert.equal(current.collected, 2);
console.log(
  'PASS unified theme album: single entry/list, compact theme browsing, explicit selection, completed/empty/error states, pending/back guards, failure retry and success close',
);
