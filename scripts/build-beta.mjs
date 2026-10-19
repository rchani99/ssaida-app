import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

import policy from '../src/config/environment-policy.js';

// Only public build configuration is accepted. Never load service-account JSON,
// signing credentials or server secrets into the mobile build environment.
const [envPath = '.env.beta.local', mode = 'build'] = process.argv.slice(2);
if (!['build', 'inspect', 'check'].includes(mode) || process.argv.length > 4)
  throw new Error('Usage: node scripts/build-beta.mjs [env-file] [build|inspect|check]');
const names = [
  'EXPO_PUBLIC_APP_ENV',
  'EXPO_PUBLIC_PRODUCTION_SUPABASE_URL',
  'EXPO_PUBLIC_PRODUCTION_SUPABASE_PUBLISHABLE_KEY',
  'EXPO_PUBLIC_PRODUCTION_SUPABASE_PROJECT_REF',
  'EXPO_PUBLIC_ENABLE_DEV_EMAIL_LOGIN',
  'EXPO_PUBLIC_AUTH_REDIRECT_URI',
];
const values = parseEnv(readFileSync(envPath, 'utf8'));
if (Object.keys(values).some((name) => !names.includes(name)))
  throw new Error('Beta env file must contain only the documented public production variables.');
const env = { ...process.env };
for (const name of Object.keys(env)) if (name.startsWith('EXPO_PUBLIC_')) delete env[name];
Object.assign(env, values, { EXPO_NO_DOTENV: '1', EAS_BUILD_PROFILE: 'beta' });
env.EXPO_PUBLIC_APP_ENV ??= 'production';
env.EXPO_PUBLIC_ENABLE_DEV_EMAIL_LOGIN ??= 'false';
policy.validateEnvironment(
  {
    environment: env.EXPO_PUBLIC_APP_ENV,
    productionUrl: env.EXPO_PUBLIC_PRODUCTION_SUPABASE_URL,
    productionKey: env.EXPO_PUBLIC_PRODUCTION_SUPABASE_PUBLISHABLE_KEY,
    productionProjectRef: env.EXPO_PUBLIC_PRODUCTION_SUPABASE_PROJECT_REF,
    devLogin: env.EXPO_PUBLIC_ENABLE_DEV_EMAIL_LOGIN,
    redirectUri: env.EXPO_PUBLIC_AUTH_REDIRECT_URI,
  },
  true,
);
if (mode === 'check') {
  console.log('PASS beta production configuration (values omitted)');
} else {
  const args =
    mode === 'inspect'
      ? [
          'build:inspect',
          '--platform',
          'android',
          '--profile',
          'beta',
          '--stage',
          'archive',
          '--output',
          'outputs/beta/archive',
        ]
      : ['build', '--platform', 'android', '--profile', 'beta', '--non-interactive', '--no-wait'];
  // EAS_CLI_PATH optionally reuses an existing local CLI installation. Otherwise
  // the shell command is entirely constant: no file path/user input is interpolated.
  const result = env.EAS_CLI_PATH
    ? spawnSync(process.execPath, [env.EAS_CLI_PATH, ...args], { env, stdio: 'inherit' })
    : spawnSync(`pnpm dlx eas-cli@25.0.0 ${args.join(' ')}`, {
        env,
        stdio: 'inherit',
        shell: true,
      });
  if (result.error) throw new Error('Could not start EAS CLI. Check Node.js, pnpm and EAS login.');
  process.exitCode = result.status ?? 1;
}
