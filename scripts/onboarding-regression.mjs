// Runs the real screen handlers against isolated hook/service fixtures; no DB or device calls.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import ts from 'typescript';

function load(path, imports = {}) {
  const module = { exports: {} };
  const source = ts.transpileModule(readFileSync(new URL('../' + path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  new Function('require', 'module', 'exports', source)(
    (id) => {
      assert.ok(id in imports, 'Unexpected import: ' + id);
      return imports[id];
    },
    module,
    module.exports,
  );
  return module.exports;
}
const jsx = (type, props) => ({ type, props });
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
      : String(tree ?? '');
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function harness() {
  const slots = [];
  let cursor = 0;
  const calls = [];
  const refreshes = [];
  const modes = [];
  const { OnboardingScreen } = load('src/features/onboarding/screens/onboarding-screen.tsx', {
    react: {
      useState(initial) {
        const i = cursor++;
        if (!(i in slots)) slots[i] = initial;
        return [
          slots[i],
          (value) => {
            slots[i] = typeof value === 'function' ? value(slots[i]) : value;
          },
        ];
      },
      useRef(initial) {
        const i = cursor++;
        return slots[i] ?? (slots[i] = { current: initial });
      },
    },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': new Proxy(
      { StyleSheet: { create: (v) => v }, Platform: { OS: 'android' } },
      {
        get: (object, key) => object[key] ?? key,
      },
    ),
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    '@/design-system/tokens': load('src/design-system/tokens.ts'),
    '@/features/auth/hooks/use-auth': {
      useAuth: () => ({
        refreshProfile: () => {
          const result = deferred();
          refreshes.push(result);
          return result.promise;
        },
      }),
    },
    '@/features/onboarding/services/complete-onboarding': {
      completeOnboarding: (input) => {
        const result = deferred();
        calls.push({ input, ...result });
        return result.promise;
      },
    },
    '@/store/app-mode.store': {
      useAppModeStore: (select) => select({ setMode: (mode) => modes.push(mode) }),
    },
  });
  const render = () => {
    cursor = 0;
    return OnboardingScreen();
  };
  const button = (label) =>
    nodes(render()).find((node) => node.type === 'Pressable' && text(node) === label);
  const inputs = () => nodes(render()).filter((node) => node.type === 'TextInput');
  const fillPin = (pin = '1234', confirmation = pin) => {
    const fields = inputs();
    fields[0].props.onChangeText(pin);
    fields[1].props.onChangeText(confirmation);
  };
  const enterPinStep = () => {
    inputs()[0].props.onChangeText('테스트 아이');
    button('다음').props.onPress();
    button('30분').props.onPress();
    button('다음').props.onPress();
  };
  return { render, button, inputs, fillPin, enterPinStep, calls, refreshes, modes };
}

const failures = [];
async function test(name, run) {
  try {
    await run();
    console.log('PASS ' + name);
  } catch (error) {
    failures.push(name);
    console.error('FAIL ' + name + ': ' + error.message);
  }
}
await test('same-render next taps do not skip the target step', () => {
  const h = harness();
  h.inputs()[0].props.onChangeText('테스트 아이');
  const next = h.button('다음').props.onPress;
  next();
  next();
  assert.ok(text(h.render()).includes('2 / 3'));
  assert.ok(h.button('30분'));
});
await test('existing input validation and back navigation preserve entries', () => {
  const h = harness();
  h.button('다음').props.onPress();
  assert.ok(text(h.render()).includes('아이 이름을 입력'));
  h.inputs()[0].props.onChangeText('테스트 아이');
  h.button('다음').props.onPress();
  h.button('다음').props.onPress();
  assert.ok(text(h.render()).includes('하루 목표 공부시간을 선택'));
  h.button('직접 입력').props.onPress();
  h.inputs()[0].props.onChangeText('9');
  h.button('다음').props.onPress();
  assert.ok(text(h.render()).includes('10~240분'));
  h.inputs()[0].props.onChangeText('241');
  h.button('다음').props.onPress();
  assert.ok(text(h.render()).includes('2 / 3'));
  h.inputs()[0].props.onChangeText('75');
  h.button('다음').props.onPress();
  h.fillPin('123', '123');
  h.button('완료').props.onPress();
  assert.ok(text(h.render()).includes('숫자 4자리'));
  h.fillPin('1234', '4321');
  h.button('완료').props.onPress();
  assert.ok(text(h.render()).includes('PIN이 일치하지 않습니다'));
  assert.equal(h.calls.length, 0);
  h.button('이전').props.onPress();
  assert.equal(h.inputs()[0].props.value, '75');
  h.button('이전').props.onPress();
  assert.equal(h.inputs()[0].props.value, '테스트 아이');
});
await test('same-render submit taps issue one save and one profile refresh', async () => {
  const h = harness();
  h.enterPinStep();
  h.fillPin();
  const submit = h.button('완료').props.onPress;
  const first = submit();
  const second = submit();
  assert.equal(h.calls.length, 1, 'Repeated taps must not reinitialize the child or PIN');
  h.calls[0].resolve();
  await Promise.resolve();
  assert.equal(h.refreshes.length, 1);
  assert.deepEqual(h.modes, ['child']);
  h.refreshes[0].resolve();
  await Promise.all([first, second]);
});
await test('save failure keeps entries, unlocks retry, and never refreshes before success', async () => {
  const h = harness();
  h.enterPinStep();
  h.fillPin();
  const submit = h.button('완료').props.onPress();
  assert.ok(h.inputs().every((node) => node.props.editable === false));
  assert.ok(
    nodes(h.render())
      .filter((node) => node.type === 'Pressable')
      .every((node) => node.props.disabled),
  );
  assert.deepEqual(h.calls[0].input, {
    childName: '테스트 아이',
    dailyTargetMinutes: 30,
    parentPin: '1234',
  });
  h.calls[0].reject(new Error('isolated network failure'));
  await submit;
  assert.ok(text(h.render()).includes('다시 시도'));
  assert.deepEqual(
    h.inputs().map((node) => node.props.value),
    ['1234', '1234'],
  );
  assert.ok(h.inputs().every((node) => node.props.editable !== false));
  assert.equal(h.refreshes.length, 0);
  assert.deepEqual(h.modes, []);
  const retry = h.button('완료').props.onPress();
  assert.equal(h.calls.length, 2);
  assert.deepEqual(h.calls[1].input, h.calls[0].input);
  h.calls[1].resolve();
  await Promise.resolve();
  assert.equal(h.refreshes.length, 1);
  // Keep the save guard until the profile read settles, too.
  assert.ok(h.inputs().every((node) => node.props.editable === false));
  h.refreshes[0].resolve();
  await retry;
});
assert.deepEqual(failures, [], 'Onboarding regression failures');
console.log(
  'PASS onboarding: input validation, ordered steps, one in-flight save, preserved retry, and profile handoff',
);
