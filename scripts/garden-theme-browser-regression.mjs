import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import ts from 'typescript';

const jsx = (type, props, key) => ({ type, props, key });
const themes = [
  ['DINO', '공룡'],
  ['GEM', '보석'],
  ['ROBOT', '로봇'],
  ['DOLL', '인형'],
  ['COIN', '동전'],
  ['PLANT', '식물'],
];
let state = [];
let cursor = 0;
let queries;
const completed = {
  total: 1,
  collected: 1,
  isComplete: true,
  entries: [{ state: 'collected', name: '공룡 친구' }],
};
const current = { total: 1, collected: 0, isComplete: false, entries: [{ state: 'growing' }] };
const results = themes.map(([code]) => ({
  data:
    code === 'DINO'
      ? completed
      : code === 'DOLL'
        ? current
        : { total: 0, entries: [], isComplete: false },
}));
const imports = {
  'react/jsx-runtime': { jsx, jsxs: jsx },
  react: {
    useState: (initial) => {
      const i = cursor++;
      if (!(i in state)) state[i] = initial;
      return [
        state[i],
        (v) => {
          state[i] = v;
        },
      ];
    },
  },
  'react-native': {
    Pressable: 'Button',
    View: 'View',
    Text: 'Text',
    StyleSheet: { create: (s) => s },
  },
  '@tanstack/react-query': {
    useQueries: (options) => {
      queries = options.queries;
      return results;
    },
  },
  '@/design-system/tokens': { childCollectionTokens: {}, colors: {}, spacing: {} },
  '@/features/learning/api/collection-album-api': {
    fetchCollectionAlbum: (child, theme) => ({ child, theme }),
  },
  '@/features/learning/components/collection-album': { CollectionAlbum: 'Album' },
  '@/features/learning/components/next-theme-panel': {
    collectionThemes: themes,
    NextThemePanel: 'Next',
  },
};
const module = { exports: {} };
const source = readFileSync('src/features/learning/components/theme-album-browser.tsx', 'utf8');
const js = ts.transpileModule(source, {
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
let canSwitch = false;
const render = () => {
  cursor = 0;
  return module.exports.ThemeAlbumBrowser({ childId: 'child', currentTheme: 'DOLL', canSwitch });
};
const press = (label) => {
  const button = nodes(render()).find(
    (n) => n.type === 'Button' && (n.props.accessibilityLabel === label || text(n).includes(label)),
  );
  assert.ok(button, label);
  button.props.onPress();
};
assert.ok(!nodes(render()).some((n) => n.type === 'Next'));
press('인형 테마');
assert.match(text(render()), /공룡.*완료/);
assert.match(text(render()), /현재 진행 중/);
press('공룡 · 완료 · 도감 보기');
assert.equal(nodes(render()).find((n) => n.type === 'Album').props.album, completed);
assert.match(text(render()), /현재 키우는 테마 · 인형/);
assert.deepEqual(queries[0].queryFn(), { child: 'child', theme: 'DINO' });
assert.deepEqual(queries[3].queryKey, ['learning', 'collection-album', 'child', 'DOLL']);
assert.equal(current.collected, 0);
assert.ok(!nodes(render()).some((n) => n.type === 'Next'));
press('현재 정원으로 돌아가기');
assert.ok(!nodes(render()).some((n) => n.type === 'Album'));
state = []; // Remount: server current theme remains DOLL; viewing did not write it.
press('인형 테마');
assert.equal(nodes(render()).find((n) => n.type === 'Album').props.album, current);
canSwitch = true;
assert.equal(nodes(render()).find((n) => n.type === 'Next').props.themeCode, 'DOLL');
assert.ok(!/mutate|useSelectCollectionTheme/.test(source));
console.log(
  'PASS: theme entry, completed album browsing, per-theme query isolation, current theme preserved, remount, completion-only transition entry',
);
