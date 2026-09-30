import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';

import ts from 'typescript';

import policy from '../src/config/environment-policy.js';

const slots = [];
let cursor = 0;
let calls = 0;
let fail = true;
let submitted;
const jsx = (type, props) => ({ type, props });
const mocks = {
  '@/config/environment-policy': policy,
  react: {
    useState: (initial) => {
      const i = cursor++;
      if (!(i in slots)) slots[i] = initial;
      return [
        slots[i],
        (next) => {
          slots[i] = next;
        },
      ];
    },
  },
  'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
  'react-native': {
    Modal: 'Modal',
    Pressable: 'Pressable',
    SafeAreaView: 'SafeAreaView',
    ScrollView: 'ScrollView',
    Text: 'Text',
    TextInput: 'TextInput',
    View: 'View',
    StyleSheet: { create: (x) => x },
  },
  'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
  '@/design-system/tokens': { colors: {}, radius: {}, sizing: {}, spacing: {} },
  '@/lib/supabase/client': {
    getSupabaseClient: () => ({
      auth: {
        signInWithPassword: async (input) => {
          calls++;
          submitted = input;
          return { error: fail ? new Error('private diagnostic') : null };
        },
      },
    }),
  },
};
function load(file, dev, imports = mocks) {
  const js = ts.transpileModule(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', '__DEV__', js)(
    (id) => {
      assert.ok(id in imports, `Unexpected dependency: ${id}`);
      return imports[id];
    },
    module,
    module.exports,
    dev,
  );
  return module.exports;
}
const file = 'src/features/auth/dev/local-test-login.tsx';
const dev = load(file, true);
const original = process.env.EXPO_PUBLIC_SUPABASE_URL;
const originalFlag = process.env.EXPO_PUBLIC_ENABLE_DEV_EMAIL_LOGIN;
const originalEnvironment = process.env.EXPO_PUBLIC_APP_ENV;
const flatten = (tree) =>
  !tree || typeof tree !== 'object'
    ? []
    : Array.isArray(tree)
      ? tree.flatMap(flatten)
      : [tree, ...flatten(tree.props?.children)];
const text = (tree) =>
  typeof tree === 'string'
    ? tree
    : !tree
      ? ''
      : Array.isArray(tree)
        ? tree.map(text).join('')
        : text(tree.props?.children);
const render = () => {
  cursor = 0;
  return dev.LocalTestLogin();
};
const field = (label) => flatten(render()).find((n) => n.props?.accessibilityLabel === label).props;
const button = (label) =>
  flatten(render()).find((n) => n.type === 'Pressable' && text(n) === label).props;
const settle = () => new Promise((resolve) => setImmediate(resolve));
try {
  process.env.EXPO_PUBLIC_APP_ENV = 'development';
  delete process.env.EXPO_PUBLIC_ENABLE_DEV_EMAIL_LOGIN;
  process.env.EXPO_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321';
  assert.equal(dev.isLocalTestLoginAllowed(), false);
  assert.equal(render(), null);
  process.env.EXPO_PUBLIC_ENABLE_DEV_EMAIL_LOGIN = 'true';
  for (const url of ['https://remote.supabase.co', 'http://127.0.0.1.evil.test:54321', 'invalid']) {
    process.env.EXPO_PUBLIC_SUPABASE_URL = url;
    assert.equal(dev.isLocalTestLoginAllowed(), false);
    assert.equal(render(), null);
  }
  for (const url of [
    'https://yisdbiuswuitzfmzlnoc.supabase.co',
    'https://ffnxodulitwzuqswlaga.supabase.co.evil.test',
    'http://ffnxodulitwzuqswlaga.supabase.co',
    'https://ffnxodulitwzuqswlaga.supabase.co/path',
  ]) {
    process.env.EXPO_PUBLIC_SUPABASE_URL = url;
    assert.equal(dev.isLocalTestLoginAllowed(), false);
  }
  process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://ffnxodulitwzuqswlaga.supabase.co';
  process.env.EXPO_PUBLIC_ENABLE_DEV_EMAIL_LOGIN = 'false';
  assert.equal(dev.isLocalTestLoginAllowed(), false);
  process.env.EXPO_PUBLIC_ENABLE_DEV_EMAIL_LOGIN = 'true';
  assert.equal(dev.isLocalTestLoginAllowed(), true);
  process.env.EXPO_PUBLIC_APP_ENV = 'production';
  assert.equal(dev.isLocalTestLoginAllowed(), false);
  process.env.EXPO_PUBLIC_APP_ENV = 'development';
  assert.equal(load(file, false).isLocalTestLoginAllowed(), false);
  process.env.EXPO_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321';
  assert.equal(load(file, false).isLocalTestLoginAllowed(), false);
  // In release, the entry point must not even require the DEV form module.
  load('src/features/auth/screens/login-screen.tsx', false, {
    ...mocks,
    '@/features/auth/hooks/use-auth': {},
    '@/features/auth/services/google-oauth': {},
  });
  button('DEV · 테스트 계정 로그인').onPress();
  field('테스트 이메일').onChangeText(' fixture@example.test ');
  const ephemeral = randomBytes(16).toString('hex');
  field('테스트 비밀번호').onChangeText(ephemeral);
  assert.equal(field('테스트 비밀번호').secureTextEntry, true);
  button('테스트 계정으로 로그인').onPress();
  await settle();
  assert.equal(calls, 1);
  assert.equal(submitted.email, 'fixture@example.test');
  assert.equal(submitted.password, ephemeral);
  assert.equal(field('테스트 비밀번호').value, '');
  assert.ok(!text(render()).includes('private diagnostic'));
  fail = false;
  field('테스트 비밀번호').onChangeText(ephemeral);
  button('테스트 계정으로 로그인').onPress();
  await settle();
  assert.equal(flatten(render()).find((n) => n.type === 'Modal').props.visible, false);
  assert.equal(field('테스트 이메일').value, '');
  assert.equal(field('테스트 비밀번호').value, '');
  console.log(
    'PASS DEV login: release module guard, local and explicit DEV allowlist, production blocked, normal password Auth, cleared inputs, generic errors',
  );
} finally {
  if (originalEnvironment === undefined) delete process.env.EXPO_PUBLIC_APP_ENV;
  else process.env.EXPO_PUBLIC_APP_ENV = originalEnvironment;
  if (original === undefined) delete process.env.EXPO_PUBLIC_SUPABASE_URL;
  else process.env.EXPO_PUBLIC_SUPABASE_URL = original;
  if (originalFlag === undefined) delete process.env.EXPO_PUBLIC_ENABLE_DEV_EMAIL_LOGIN;
  else process.env.EXPO_PUBLIC_ENABLE_DEV_EMAIL_LOGIN = originalFlag;
}
