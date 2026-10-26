import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import ts from 'typescript';

function load(file, mocks) {
  const module = { exports: {} };
  const code = ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  new Function('require', 'module', 'exports', code)(
    (id) => {
      assert.ok(id in mocks, `Unexpected import ${id}`);
      return mocks[id];
    },
    module,
    module.exports,
  );
  return module.exports;
}
const values = new Map();
let readFails = false,
  writeFails = false;
const store = load('src/features/learning/services/backlog-help.ts', {
  '@react-native-async-storage/async-storage': {
    __esModule: true,
    default: {
      getItem: async (key) => {
        if (readFails) throw Error('fixture');
        return values.get(key) ?? null;
      },
      setItem: async (key, value) => {
        if (writeFails) throw Error('fixture');
        values.set(key, value);
      },
    },
  },
});
assert.equal(await store.hasSeenBacklogHelp('a'), false);
await store.markBacklogHelpSeen('a');
assert.equal(await store.hasSeenBacklogHelp('a'), true);
assert.equal(await store.hasSeenBacklogHelp('b'), false, 'another account has its own help state');
assert.equal(values.get('ssaida.help.backlog.v1:a'), 'seen');
readFails = true;
assert.equal(await store.hasSeenBacklogHelp('c'), false, 'read error does not reject');
writeFails = true;
await store.markBacklogHelpSeen('c');
assert.equal(
  await store.hasSeenBacklogHelp('c'),
  true,
  'failed persistence still suppresses this session',
);

let userId = 'a';
let focusEffect;
const jsx = (type, props, key) => ({ type, props, key });
let slots = [],
  cursor = 0,
  effects = [],
  resolveRead,
  marked = [];
const component = load('src/features/learning/components/backlog-help.tsx', {
  react: {
    useState: (initial) => {
      const i = cursor++;
      if (!(i in slots)) slots[i] = initial;
      return [
        slots[i],
        (v) => {
          slots[i] = v;
        },
      ];
    },
    useRef: (initial) => {
      const i = cursor++;
      return slots[i] ?? (slots[i] = { current: initial });
    },
    useCallback: (callback) => callback,
  },
  'expo-router': {
    useFocusEffect: (effect) => {
      focusEffect = effect;
      const i = cursor++;
      if (!(i in slots)) {
        slots[i] = true;
        effects.push(effect);
      }
    },
  },
  'react/jsx-runtime': { jsx, jsxs: jsx },
  'react-native': {
    Modal: 'Modal',
    Pressable: 'Pressable',
    ScrollView: 'ScrollView',
    Text: 'Text',
    View: 'View',
    StyleSheet: { create: (s) => s },
  },
  'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
  'lucide-react-native': { CircleHelp: 'Icon' },
  '@/design-system/icons': { dashboardIconProps: {} },
  '@/design-system/tokens': {
    dashboardTokens: { spacing: {}, colors: {}, typography: {}, radius: {}, icon: {} },
  },
  '@/features/auth/hooks/use-auth': {
    useAuth: () => ({ session: userId ? { user: { id: userId } } : null }),
  },
  '@/features/learning/components/learning-controls': { LearningButton: 'Button' },
  '@/features/learning/services/backlog-help': {
    hasSeenBacklogHelp: () =>
      new Promise((resolve) => {
        resolveRead = resolve;
      }),
    markBacklogHelpSeen: async (id) => {
      marked.push(id);
    },
  },
});
const nodes = (v) =>
  !v || typeof v !== 'object'
    ? []
    : Array.isArray(v)
      ? v.flatMap(nodes)
      : [v, ...nodes(v.props?.children)];
const render = () => {
  cursor = 0;
  return component.AccountBacklogHelp({ userId: 'a' });
};
const modal = () => nodes(render()).find((n) => n.type === 'Modal').props;
const reopen = () =>
  nodes(render())
    .find((n) => n.props?.accessibilityLabel === '밀린 공부 도움말 다시 보기')
    .props.onPress();
const close = () =>
  nodes(render())
    .find((n) => n.props?.label === '알겠어요')
    .props.onPress();
const reset = () => {
  slots = [];
  effects = [];
  marked = [];
  render();
  return effects.shift()();
};
let cleanup = reset();
assert.equal(modal().visible, false);
resolveRead(false);
await Promise.resolve();
assert.equal(modal().visible, true, 'first entry opens help');
close();
assert.equal(modal().visible, false);
assert.deepEqual(marked, ['a']);
reopen();
assert.equal(modal().visible, true, 'manual help remains available');
modal().onRequestClose();
assert.equal(modal().visible, false, 'Android back closes without blocking');
cleanup();
cleanup = reset();
resolveRead(true);
await Promise.resolve();
assert.equal(modal().visible, false, 'seen accounts do not auto-open');
cleanup();
cleanup = reset();
reopen();
close();
resolveRead(false);
await Promise.resolve();
assert.equal(modal().visible, false, 'late read cannot reopen dismissed help');
cleanup();
cleanup = reset();
cleanup();
resolveRead(false);
await Promise.resolve();
assert.equal(modal().visible, false, 'unmounted reader cannot show a stale prompt');
cleanup = reset();
resolveRead(false);
await Promise.resolve();
assert.equal(modal().visible, true);
cleanup();
assert.equal(modal().visible, false, 'blur hides an already visible native modal');
assert.deepEqual(marked, [], 'blur is not acknowledgement');
cleanup = focusEffect();
resolveRead(false);
await Promise.resolve();
assert.equal(modal().visible, true, 'unacknowledged help can open on refocus');
cleanup();
assert.equal(component.BacklogHelp().key, 'a');
userId = 'b';
assert.equal(component.BacklogHelp().key, 'b', 'account switch remounts isolated help state');
userId = null;
assert.equal(component.BacklogHelp(), null);
console.log(
  'PASS backlog help: account storage, failures, once/reopen, close/back, stale read/unmount/account switch',
);
