import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import ts from 'typescript';

const jsx = (type, props) => ({ type, props });
function load(path, imports = {}) {
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
function harness(hasStudies = false) {
  let effect, resolve, reject, onChange;
  let started = 0,
    stopped = 0,
    removed = 0;
  const configurations = [],
    values = [];
  let loops;
  const { RestDayCard } = load('src/features/learning/components/rest-day-card.tsx', {
    'react/jsx-runtime': { jsx, jsxs: jsx },
    react: {
      useState: (init) => [init()],
      useEffect: (callback) => {
        effect = callback;
      },
    },
    '@/design-system/tokens': load('src/design-system/tokens.ts'),
    'react-native-svg': { default: 'Svg', Circle: 'Circle', Ellipse: 'Ellipse', Path: 'Path' },
    'react-native': {
      View: 'View',
      Text: 'Text',
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
        },
        timing: (_value, config) => {
          configurations.push(config);
          return {};
        },
        sequence: () => ({}),
        loop: (_sequence, options) => {
          loops = options.iterations;
          return {
            start: () => {
              started++;
            },
            stop: () => {
              stopped++;
            },
          };
        },
      },
      AccessibilityInfo: {
        isReduceMotionEnabled: () =>
          new Promise((yes, no) => {
            resolve = yes;
            reject = no;
          }),
        addEventListener: (event, callback) => {
          assert.equal(event, 'reduceMotionChanged');
          onChange = callback;
          return {
            remove: () => {
              removed++;
            },
          };
        },
      },
    },
  });
  const tree = RestDayCard({ hasStudies });
  const cleanup = effect();
  return {
    tree,
    cleanup,
    resolve,
    reject,
    onChange,
    configurations,
    values,
    stats: () => ({ started, stopped, removed, loops }),
  };
}
const tick = () => new Promise((resolve) => setImmediate(resolve));
let test = harness();
assert.ok(JSON.stringify(test.tree).includes('쉬는 시간도 소중해요.'));
assert.ok(JSON.stringify(test.tree).includes('no-hide-descendants'));
test.resolve(false);
await tick();
assert.equal(test.stats().started, 1);
assert.equal(test.stats().loops, 2, 'Rest animation ends after two gentle cycles');
assert.ok(
  test.configurations.every((config) => config.useNativeDriver && config.isInteraction === false),
);
test.onChange(true);
assert.equal(test.stats().stopped, 1);
assert.equal(test.values[0].value, 0, 'Reduced motion restores the resting position');
test.cleanup();
assert.equal(test.stats().removed, 1);

test = harness(true);
assert.ok(JSON.stringify(test.tree).includes('따로 남아 있는 공부는 아래에서 확인해요.'));
assert.ok(!JSON.stringify(test.tree).includes('모두 완료'));
test.resolve(true);
await tick();
assert.equal(test.stats().started, 0);
test.cleanup();

test = harness();
test.cleanup();
test.resolve(false);
await tick();
assert.equal(test.stats().started, 0);

test = harness();
test.onChange(true);
test.resolve(false);
await tick();
assert.equal(test.stats().started, 0, 'Latest accessibility setting wins over an old read');
test.cleanup();

test = harness();
test.reject(new Error('Unavailable'));
await tick();
assert.equal(test.stats().started, 0, 'A failed preference read leaves a static illustration');
test.cleanup();
console.log(
  'PASS rest day: bounded native animation, reduced motion/change/race, unmount cleanup, static fallback and remaining-study copy',
);
