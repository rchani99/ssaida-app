// Execute the production gate with controlled React lifecycle and persistent recovery state.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import ts from 'typescript';

let slots = [];
let cursor = 0;
let effects = [];
let dirty = true;
let marker = null;
let failure = false;
let receiptStatus = 'pending';
let resumes = 0;
let listener;
let foreground;
let tree;
const child = { accountScreens: true };
const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
const react = {
  useState(initial) {
    const i = cursor++;
    if (!(i in slots)) slots[i] = initial;
    return [
      slots[i],
      (value) => {
        slots[i] = value;
        dirty = true;
      },
    ];
  },
  useRef(initial) {
    const i = cursor++;
    return slots[i] ?? (slots[i] = { current: initial });
  },
  useCallback(callback, deps) {
    const i = cursor++;
    if (!same(slots[i]?.deps, deps)) slots[i] = { callback, deps };
    return slots[i].callback;
  },
  useEffect(callback, deps) {
    const i = cursor++;
    if (!same(slots[i]?.deps, deps)) {
      slots[i] = { deps };
      effects.push(() => {
        slots[i].cleanup = callback();
      });
    }
  },
};
const imports = {
  react,
  'react/jsx-runtime': { jsx: (type, props) => ({ type, props }) },
  'expo-router': { SplashScreen: { hideAsync: async () => {} } },
  'react-native': {
    View: 'View',
    AppState: {
      addEventListener: (_event, fn) => {
        foreground = fn;
        return {
          remove: () => {
            foreground = undefined;
          },
        };
      },
    },
  },
  '@/shared/components/screen-message': { ScreenMessage: 'ScreenMessage' },
  '@/features/auth/services/account-recovery': {
    accountRecovery: {
      read: async () => marker,
      resume: async () => {
        resumes++;
        if (marker.phase === 'unconfirmed' && marker.operation) {
          if (receiptStatus !== 'deleted')
            throw new Error(
              receiptStatus === 'pending'
                ? 'DELETE_PENDING'
                : receiptStatus === 'failed'
                  ? 'DELETE_NOT_EXECUTED'
                  : 'DELETE_RECEIPT_EXPIRED',
            );
          marker.phase = 'cleanup';
        }
        assert.equal(marker.phase, 'cleanup');
        if (failure) throw new Error('partial cleanup');
        marker = null;
        listener?.();
      },
    },
    subscribeAccountRecovery: (fn) => {
      listener = fn;
      return () => {
        listener = undefined;
      };
    },
  },
};
const mod = { exports: {} };
new Function(
  'require',
  'module',
  'exports',
  ts.transpileModule(
    readFileSync('src/features/auth/components/account-recovery-gate.tsx', 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } },
  ).outputText,
)(
  (name) => {
    assert.ok(imports[name], name);
    return imports[name];
  },
  mod,
  mod.exports,
);
const render = () => {
  cursor = 0;
  dirty = false;
  tree = mod.exports.AccountRecoveryGate({ children: child });
  for (const effect of effects.splice(0)) effect();
};
const settle = async () => {
  for (let i = 0; i < 25; i++) {
    await Promise.resolve();
    if (dirty) render();
  }
};
const restart = () => {
  for (const slot of slots) slot?.cleanup?.();
  slots = [];
  effects = [];
  render();
  assert.notEqual(tree, child, 'account providers must not mount before marker inspection');
};
restart();
await settle();
assert.equal(tree, child);
marker = { phase: 'cleanup' };
failure = true;
listener();
await settle();
assert.notEqual(tree, child);
assert.equal(tree.props.children.props.actionLabel, '정리 다시 시도');
restart();
await settle();
assert.notEqual(tree, child, 'partial cleanup remains blocked after restart');
failure = false;
tree.props.children.props.onAction();
await settle();
assert.equal(marker, null);
assert.equal(tree, child);
marker = { phase: 'cleanup' };
restart();
await settle();
assert.equal(tree, child, 'confirmed startup marker resumes without any proof');
marker = { phase: 'unconfirmed' };
const before = resumes;
restart();
await settle();
foreground('active');
await settle();
assert.equal(resumes, before, 'unknown deletion must never trigger local cleanup');
assert.notEqual(tree, child);
assert.equal(tree.props.children.props.onAction, undefined);
assert.ok(marker);
for (const status of ['pending', 'expired', 'failed']) {
  receiptStatus = status;
  marker = { phase: 'unconfirmed', operation: {} };
  restart();
  await settle();
  assert.notEqual(tree, child);
  assert.equal(tree.props.children.props.actionLabel, '삭제 결과 다시 확인');
  assert.ok(marker);
}
receiptStatus = 'deleted';
foreground('active');
await settle();
assert.equal(tree, child, 'receipt confirmation on resume unlocks only after cleanup');
assert.equal(marker, null);
console.log(
  'PASS recovery gate: startup isolation, restart/retry after failure, proof-free resume and unknown-outcome blocking',
);
