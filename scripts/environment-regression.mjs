import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import ts from 'typescript';

import appConfig from '../app.config.js';
import policy from '../src/config/environment-policy.js';

const { validateEnvironment, developmentProjectRefs, authRedirectUri } = policy;
// Synthetic public credentials only; this suite never makes network requests.
const ref = 'abcdefghijklmnopqrst';
const production = {
  environment: 'production',
  productionUrl: `https://${ref}.supabase.co`,
  productionKey: 'sb_publishable_test_fixture',
  productionProjectRef: ref,
  devLogin: 'false',
  redirectUri: authRedirectUri,
};
const development = {
  environment: 'development',
  developmentUrl: `https://${developmentProjectRefs[0]}.supabase.co`,
  developmentKey: 'sb_publishable_dev_fixture',
  devLogin: 'true',
  redirectUri: authRedirectUri,
};
assert.equal(validateEnvironment(development).url, development.developmentUrl);
assert.equal(
  validateEnvironment({ ...development, developmentUrl: 'http://127.0.0.1:54321' }).devLogin,
  true,
);
assert.equal(validateEnvironment(production, true).devLogin, false);
assert.throws(() => validateEnvironment(development, true), /Release requires/);
for (const field of Object.keys(production)) {
  assert.throws(
    () => validateEnvironment({ ...development, ...production, [field]: undefined }, true),
    /environment/,
  );
}
for (const devRef of developmentProjectRefs) {
  assert.throws(
    () =>
      validateEnvironment(
        {
          ...production,
          productionUrl: `https://${devRef}.supabase.co`,
          productionProjectRef: devRef,
        },
        true,
      ),
    /DEV Supabase/,
  );
}
for (const url of [
  'http://127.0.0.1:54321',
  `http://${ref}.supabase.co`,
  `https://${ref}.supabase.co.evil.test`,
  `https://${ref}.supabase.co/path`,
  `https://user:password@${ref}.supabase.co`,
  `https://${ref}.supabase.co?key=private`,
]) {
  assert.throws(
    () => validateEnvironment({ ...production, productionUrl: url }, true),
    /environment/,
  );
}
assert.throws(() => validateEnvironment({ ...production, devLogin: 'true' }), /DEV login/);
assert.throws(
  () => validateEnvironment({ ...development, developmentUrl: production.productionUrl }),
  /approved DEV/,
);
const jwt = (payload) =>
  `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.fixture`;
assert.equal(
  validateEnvironment({ ...production, productionKey: jwt({ role: 'anon', ref }) }, true)
    .environment,
  'production',
);
for (const key of [
  'sb_secret_do_not_print',
  jwt({ role: 'service_role', ref }),
  jwt({ role: 'anon', ref: 'other' }),
]) {
  assert.throws(
    () => validateEnvironment({ ...production, productionKey: key }, true),
    (error) => !error.message.includes(key),
  );
}

function load(file, imports, dev) {
  const module = { exports: {} };
  const source = ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  new Function('require', 'module', 'exports', '__DEV__', source)(
    (id) => {
      assert.ok(id in imports, `Missing fixture: ${id}`);
      return imports[id];
    },
    module,
    module.exports,
    dev,
  );
  return module.exports;
}
const names = [
  'EXPO_PUBLIC_APP_ENV',
  'EXPO_PUBLIC_SUPABASE_URL',
  'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'EXPO_PUBLIC_PRODUCTION_SUPABASE_URL',
  'EXPO_PUBLIC_PRODUCTION_SUPABASE_PUBLISHABLE_KEY',
  'EXPO_PUBLIC_PRODUCTION_SUPABASE_PROJECT_REF',
  'EXPO_PUBLIC_ENABLE_DEV_EMAIL_LOGIN',
  'EXPO_PUBLIC_AUTH_REDIRECT_URI',
  'EAS_BUILD_PROFILE',
  'NODE_ENV',
];
const original = Object.fromEntries(names.map((name) => [name, process.env[name]]));
const base = JSON.parse(readFileSync('app.json', 'utf8')).expo;
const eas = JSON.parse(readFileSync('eas.json', 'utf8'));
try {
  for (const name of names) delete process.env[name];
  Object.assign(process.env, {
    EXPO_PUBLIC_APP_ENV: 'production',
    EXPO_PUBLIC_PRODUCTION_SUPABASE_URL: production.productionUrl,
    EXPO_PUBLIC_PRODUCTION_SUPABASE_PUBLISHABLE_KEY: production.productionKey,
    EXPO_PUBLIC_PRODUCTION_SUPABASE_PROJECT_REF: ref,
    EXPO_PUBLIC_ENABLE_DEV_EMAIL_LOGIN: 'false',
    EXPO_PUBLIC_AUTH_REDIRECT_URI: authRedirectUri,
    EXPO_PUBLIC_SUPABASE_URL: development.developmentUrl,
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: development.developmentKey,
    EAS_BUILD_PROFILE: 'production',
  });
  const runtime = load('src/config/environment.ts', { './environment-policy': policy }, false);
  let clientCalls = 0;
  const client = load(
    'src/lib/supabase/client.ts',
    {
      '@react-native-async-storage/async-storage': {},
      '@supabase/supabase-js': {
        createClient: (url) => {
          clientCalls++;
          assert.equal(url, production.productionUrl);
          return {};
        },
      },
      'react-native': { Platform: { OS: 'web' } },
      'react-native-url-polyfill/auto': {},
      '@/config/environment': runtime,
    },
    false,
  );
  delete process.env.EXPO_PUBLIC_PRODUCTION_SUPABASE_URL;
  assert.throws(() => appConfig({ config: base }), /fallback is disabled/);
  assert.throws(() => client.getSupabaseClient(), /fallback is disabled/);
  assert.equal(clientCalls, 0, 'Invalid configuration must not create a network client');
  process.env.EXPO_PUBLIC_PRODUCTION_SUPABASE_URL = development.developmentUrl;
  assert.throws(() => client.getSupabaseClient(), /DEV Supabase/);
  process.env.EXPO_PUBLIC_PRODUCTION_SUPABASE_URL = production.productionUrl;
  process.env.EXPO_PUBLIC_ENABLE_DEV_EMAIL_LOGIN = 'true';
  assert.throws(() => client.getSupabaseClient(), /DEV login/);
  process.env.EXPO_PUBLIC_ENABLE_DEV_EMAIL_LOGIN = 'false';
  process.env.EXPO_PUBLIC_APP_ENV = 'development';
  assert.throws(() => client.getSupabaseClient(), /Release requires/);
  assert.throws(() => appConfig({ config: base }), /Release requires/);
  process.env.EXPO_PUBLIC_APP_ENV = 'production';
  client.getSupabaseClient();
  assert.equal(clientCalls, 1);
  assert.equal(appConfig({ config: base }).scheme, 'ssaida');
  assert.equal(base.android.package, 'com.ssaida.app');
  assert.equal(base.ios.bundleIdentifier, 'com.ssaida.app');
  assert.equal(base.name, '쌓이다');
  assert.equal(base.android.versionCode, 1);
  assert.equal(base.ios.buildNumber, '1');
  assert.equal(eas.build.production.environment, 'production');
  assert.equal(eas.build.production.env.EXPO_PUBLIC_ENABLE_DEV_EMAIL_LOGIN, 'false');
  assert.equal(eas.build.production.android.buildType, 'app-bundle');
  assert.equal(eas.cli.appVersionSource, 'remote');
  assert.equal(eas.build.production.autoIncrement, true);
  // Exercise Expo's real config loader without loading local .env or printing public keys.
  const result = spawnSync(process.execPath, ['node_modules/expo/bin/cli', 'config', '--json'], {
    env: { ...process.env, EXPO_NO_DOTENV: '1' },
    encoding: 'utf8',
    timeout: 60000,
  });
  assert.equal(result.status, 0, 'Expo production config with synthetic values must resolve');
  const resolved = JSON.parse(result.stdout);
  assert.equal(resolved.extra.appEnvironment, 'production');
  assert.equal(resolved.scheme, 'ssaida');
  const missing = spawnSync(process.execPath, ['node_modules/expo/bin/cli', 'config', '--json'], {
    env: { ...process.env, EXPO_NO_DOTENV: '1', EXPO_PUBLIC_PRODUCTION_SUPABASE_URL: '' },
    encoding: 'utf8',
    timeout: 60000,
  });
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /fallback is disabled/);
  process.env.EAS_BUILD_PROFILE = 'development';
  process.env.EXPO_PUBLIC_APP_ENV = 'development';
  assert.equal(appConfig({ config: base }).extra.appEnvironment, 'development');
  delete process.env.EAS_BUILD_PROFILE;
  process.env.NODE_ENV = 'production';
  assert.throws(() => appConfig({ config: base }), /Release requires/);
  delete process.env.NODE_ENV;
  assert.equal(
    load('src/config/environment.ts', { './environment-policy': policy }, true).getAppEnvironment()
      .url,
    development.developmentUrl,
  );
} finally {
  for (const name of names) {
    if (original[name] === undefined) delete process.env[name];
    else process.env[name] = original[name];
  }
}
console.log(
  'PASS environment: DEV selection, no production fallback, DEV URL/login/release/missing/key/redirect guards, pre-network validation, EAS profiles and real Expo config',
);
