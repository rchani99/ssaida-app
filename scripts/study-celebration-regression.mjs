import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import ts from 'typescript';

const jsx = (type, props) => ({ type, props });
function load(path, imports) {
  const module = { exports: {} };
  const code = ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  new Function('require', 'module', 'exports', code)(
    (name) => {
      assert.ok(name in imports, name);
      return imports[name];
    },
    module,
    module.exports,
  );
  return module.exports;
}
function harness(animate = true) {
  let effect, resolvePreference, changePreference;
  let started = 0,
    stopped = 0,
    removed = 0,
    queries = 0;
  const values = [],
    configurations = [];
  const imports = {
    'react/jsx-runtime': { jsx, jsxs: jsx },
    react: {
      useState: (init) => [init()],
      useEffect: (callback) => {
        effect = callback;
      },
    },
    'react-native-svg': { default: 'Svg', Circle: 'Circle', Ellipse: 'Ellipse', Path: 'Path' },
    'react-native': {
      View: 'View',
      StyleSheet: { create: (value) => value },
      Animated: {
        View: 'AnimatedView',
        Value: class {
          constructor(value) {
            this.value = value;
            values.push(this);
          }
          setValue(value) {
            this.value = value;
          }
          stopAnimation() {}
          interpolate(value) {
            return value;
          }
        },
        timing: (_value, config) => {
          configurations.push(config);
          return {};
        },
        sequence: () => ({}),
        parallel: () => ({
          start: () => {
            started++;
          },
          stop: () => {
            stopped++;
          },
        }),
      },
      AccessibilityInfo: {
        isReduceMotionEnabled: () => {
          queries++;
          return new Promise((resolve) => {
            resolvePreference = resolve;
          });
        },
        addEventListener: (event, callback) => {
          assert.equal(event, 'reduceMotionChanged');
          changePreference = callback;
          return {
            remove: () => {
              removed++;
            },
          };
        },
      },
    },
  };
  const { StudyCelebrationArt } = load(
    'src/features/learning/components/study-celebration-art.tsx',
    imports,
  );
  const tree = StudyCelebrationArt({ animate });
  const cleanup = effect();
  return {
    tree,
    cleanup,
    values,
    configurations,
    resolve: (reduced) => resolvePreference(reduced),
    change: (reduced) => changePreference(reduced),
    stats: () => ({ started, stopped, removed, queries }),
  };
}
const tick = () => new Promise((resolve) => setImmediate(resolve));
let test = harness();
assert.equal(test.tree.props.pointerEvents, 'none');
assert.equal(test.tree.props.importantForAccessibility, 'no-hide-descendants');
test.resolve(false);
await tick();
assert.equal(test.stats().started, 1);
assert.ok(test.configurations.every((config) => config.useNativeDriver && config.duration <= 1500));
test.change(true);
assert.equal(test.stats().stopped, 1);
assert.deepEqual(
  test.values.map((value) => value.value),
  [1, 0],
  'Reduced motion restores a visible static illustration',
);
test.cleanup();
assert.equal(test.stats().removed, 1);

test = harness();
test.resolve(true);
await tick();
assert.equal(test.stats().started, 0);
test.cleanup();

test = harness();
test.cleanup();
test.resolve(false);
await tick();
assert.equal(test.stats().started, 0, 'Never start after leaving the screen');

test = harness();
test.change(true);
test.resolve(false);
await tick();
assert.equal(
  test.stats().started,
  0,
  'A late initial preference must not override the latest setting',
);
test.cleanup();

test = harness(false);
assert.deepEqual(
  test.stats(),
  { started: 0, stopped: 0, removed: 0, queries: 0 },
  'The completed list remains static',
);
console.log(
  'PASS celebration art: short native animation, reduced motion, preference race/change, cleanup, decorative accessibility and static completed state',
);
