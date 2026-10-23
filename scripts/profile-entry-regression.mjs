import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import ts from 'typescript';

// Render the actual root navigator with controlled auth state; no router/device/network calls.
let auth;
let mode = 'child';
let retries = 0;
let hides = 0;
const jsx = (type, props) => ({ type, props });
const Stack = Object.assign(() => {}, { Protected: 'Protected', Screen: 'Screen' });
const imports = {
  react: { useEffect: (callback) => callback() },
  'react/jsx-runtime': { jsx, jsxs: jsx },
  'expo-router': {
    DefaultTheme: { colors: {} },
    Stack,
    ThemeProvider: 'ThemeProvider',
    SplashScreen: {
      preventAutoHideAsync: async () => {},
      hideAsync: async () => {
        hides++;
      },
    },
  },
  'expo-status-bar': { StatusBar: 'StatusBar' },
  'react-native': { View: 'View' },
  '@/design-system/tokens': { colors: {} },
  '@/features/auth/components/child-mode-button': { ChildModeButton: 'ChildModeButton' },
  '@/features/auth/components/pending-account-action-banner': {
    PendingAccountActionBanner: 'PendingAccountActionBanner',
  },
  '@/features/auth/hooks/use-auth': { useAuth: () => auth },
  '@/features/auth/screens/loading-screen': { LoadingScreen: 'LoadingScreen' },
  '@/features/notifications/notification-routing': { NotificationRouting: 'NotificationRouting' },
  '@/providers/app-providers': { AppProviders: 'AppProviders' },
  '@/store/app-mode.store': { useAppModeStore: (selector) => selector({ mode }) },
  '@/shared/components/screen-message': { ScreenMessage: 'ScreenMessage' },
};
const module = { exports: {} };
new Function(
  'require',
  'module',
  'exports',
  ts.transpileModule(readFileSync(new URL('../src/app/_layout.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText,
)(
  (id) => {
    assert.ok(id in imports, id);
    return imports[id];
  },
  module,
  module.exports,
);
const flatten = (node) =>
  !node || typeof node !== 'object'
    ? []
    : Array.isArray(node)
      ? node.flatMap(flatten)
      : [node, ...flatten(node.props?.children)];
const render = () => {
  const navigator = flatten(module.exports.default()).find(
    (node) => typeof node.type === 'function',
  );
  return navigator.type(navigator.props);
};
const accessibleScreens = (node, permitted = true) => {
  if (!node || typeof node !== 'object' || !permitted) return [];
  if (Array.isArray(node)) return node.flatMap((child) => accessibleScreens(child, permitted));
  if (node.type === 'Screen') return [node.props.name];
  return accessibleScreens(node.props?.children, node.type !== 'Protected' || node.props.guard);
};
auth = {
  isLoading: false,
  isAuthenticated: true,
  session: { user: { id: 'existing-parent' } },
  profile: null,
  errorMessage: '부모 프로필을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.',
  refreshProfile: async () => {
    retries++;
  },
};
for (const currentMode of ['child', 'parent']) {
  mode = currentMode;
  const tree = render();
  assert.equal(
    tree.type,
    'ScreenMessage',
    'profile failure must show retry, never new-account setup',
  );
  assert.equal(tree.props.message, auth.errorMessage);
  assert.equal(tree.props.actionLabel, '다시 시도');
  assert.deepEqual(accessibleScreens(tree), []);
  assert.ok(!flatten(tree).some((node) => node.type === 'NotificationRouting'));
  await tree.props.onAction();
}
assert.equal(retries, 2);
assert.ok(hides > 0, 'error screen must be visible beyond splash');
auth.isLoading = true;
assert.equal(render().type, 'LoadingScreen', 'retry loading must not open onboarding');
auth.isLoading = false;
auth.errorMessage = null;
auth.profile = { onboarding_completed: true };
mode = 'child';
assert.ok(accessibleScreens(render()).includes('child'));
assert.ok(!accessibleScreens(render()).includes('(onboarding)'));
assert.ok(!accessibleScreens(render()).includes('parent'));
mode = 'parent';
assert.ok(accessibleScreens(render()).includes('parent'));
for (const profile of [null, { onboarding_completed: false }]) {
  auth.profile = profile;
  const screens = accessibleScreens(render());
  assert.ok(screens.includes('(onboarding)'), 'successful new-profile lookup still starts setup');
  assert.ok(!screens.includes('child'));
  assert.ok(!screens.includes('parent'));
}
auth.isAuthenticated = false;
auth.session = null;
auth.errorMessage = 'configuration error';
assert.ok(
  accessibleScreens(render()).includes('(auth)'),
  'login retains its own configuration error',
);
assert.ok(!accessibleScreens(render()).includes('(onboarding)'));
console.log(
  'PASS profile entry: failures offer read-only retry, successful lookup selects existing/new account routes and preserves parent guard',
);
