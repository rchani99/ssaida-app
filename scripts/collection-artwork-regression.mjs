import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import ts from 'typescript';

function load(path, imports = {}, asset = false) {
  const module = { exports: {} };
  const output = ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  new Function('require', 'module', 'exports', output)(
    (id) => {
      if (asset && id.endsWith('.webp')) {
        const absolute = resolve(path, '..', id);
        assert.ok(existsSync(absolute), `Missing bundled image: ${id}`);
        return id;
      }
      assert.ok(id in imports, `Missing import: ${id}`);
      return imports[id];
    },
    module,
    module.exports,
  );
  return module.exports;
}
const manifest = load('src/features/learning/assets/collection-assets.ts', {}, true);
assert.ok(Object.keys(manifest.collectionAssets).length > 0);
const seededCodes = [
  ...readFileSync('supabase/seed.sql', 'utf8').matchAll(/'DEV_([A-Z]+_\d{2,})'/g),
].map((match) => match[1]);
assert.equal(seededCodes.length, Object.keys(manifest.collectionAssets).length);
assert.deepEqual(new Set(seededCodes), new Set(Object.keys(manifest.collectionAssets)));
for (const item of Object.values(manifest.collectionAssets)) assert.equal(item.growth.length, 5);
const artworkUtils = load('src/features/learning/utils/collection-artwork.ts', {
  '@/features/learning/assets/collection-assets': manifest,
});
const { collectionArtwork } = artworkUtils;
assert.equal(collectionArtwork('DEV_DINO_01'), collectionArtwork('dino_01'));
for (const code of [undefined, null, '', 'UNKNOWN', '__proto__', 'UNKNOWN_ITEM']) {
  assert.equal(collectionArtwork(code), undefined);
}
const jsx = (type, props) => ({ type, props });
const native = new Proxy({ StyleSheet: { create: (s) => s } }, { get: (o, k) => o[k] ?? k });
const tokens = load('src/design-system/tokens.ts');
const common = {
  'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
  'react-native': native,
  'expo-image': { Image: 'Image' },
  '@/design-system/tokens': tokens,
  '@/features/learning/utils/collection-artwork': artworkUtils,
};
const stages = load('src/features/learning/utils/completion-reward.ts', {
  '@/features/learning/utils/visible-tasks': {},
});
const { GrowthVisual } = load('src/features/learning/components/growth-visual.tsx', {
  ...common,
  '@/features/learning/utils/completion-reward': stages,
});
function nodes(tree) {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!tree || typeof tree !== 'object') return [];
  if (typeof tree.type === 'function') return nodes(tree.type(tree.props));
  return [tree, ...nodes(tree.props?.children)];
}
for (const code of Object.keys(manifest.collectionAssets)) {
  for (const [points, ready, stage] of [
    [0, false, 0],
    [25, false, 1],
    [50, false, 2],
    [75, false, 3],
    [100, true, 4],
  ]) {
    const tree = GrowthVisual({ points, goal: 100, ready, artworkCode: code });
    const images = nodes(tree).filter((n) => n.type === 'Image');
    assert.equal(images.length, 1);
    assert.equal(images[0].props.source, collectionArtwork(code).growth[stage]);
    assert.notEqual(images[0].props.source, collectionArtwork(code).complete);
  }
}
assert.ok(
  !nodes(GrowthVisual({ points: 1, goal: 7, ready: false, artworkCode: 'UNKNOWN' })).some(
    (n) => n.type === 'Image',
  ),
);
const artComponent = load('src/features/learning/components/collection-artwork.tsx', common);
const { buildCollectionAlbum } = load('src/features/learning/utils/collection-album.ts');
const { CollectionAlbum } = load('src/features/learning/components/collection-album.tsx', {
  ...common,
  '@/features/learning/components/collection-artwork': artComponent,
});
const catalog = ['collected', 'ready', 'growing', 'locked'].map((id) => ({ id }));
const owned = catalog.slice(0, 3).map(({ id }) => ({
  collectible_catalog_id: id,
  revealed_at: id === 'collected' ? '2026-10-08' : null,
  status: id === 'growing' ? 'GROWING' : 'COMPLETED',
  progress_points: 1,
  growth_goal_snapshot: 2,
}));
const album = buildCollectionAlbum(
  catalog,
  owned,
  catalog.map(({ id }) => ({ id, name: id, code: 'DINO_01' })),
);
for (const entry of album.entries.slice(1)) assert.equal(entry.artworkCode, undefined);
const images = nodes(CollectionAlbum({ album })).filter((n) => n.type === 'Image');
assert.equal(images.length, 1, 'Only revealed album entries display final artwork');
assert.equal(images[0].props.source, collectionArtwork('DINO_01').complete);
console.log(
  `PASS all ${seededCodes.length * 6} bundled assets, seed aliases, unknown-code fallback, all five stages for ${seededCodes.length} items, final-art reveal gating`,
);
