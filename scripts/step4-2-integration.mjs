import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

import { createClient } from '@supabase/supabase-js';

const url = process.env.STEP3_API_URL;
const key = process.env.STEP3_ANON_KEY;
const serviceKey = process.env.STEP3_SERVICE_ROLE_KEY;
const container = process.env.STEP42_DB_CONTAINER ?? 'supabase_db_ssaida-app';
if (!url || !key || !serviceKey || !['localhost', '127.0.0.1'].includes(new URL(url).hostname)) {
  throw new Error('Local Supabase test environment is required');
}
assert.match(container, /^supabase_db_[a-zA-Z0-9_-]+$/);
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, serviceKey, options);
const users = [];
async function checked(request) {
  const result = await request;
  assert.equal(result.error, null, result.error?.message);
  return result.data;
}
function sql(statement) {
  return execFileSync(
    'docker',
    [
      'exec',
      container,
      'psql',
      '-U',
      'postgres',
      '-d',
      'postgres',
      '-At',
      '-v',
      'ON_ERROR_STOP=1',
      '-c',
      statement,
    ],
    { encoding: 'utf8' },
  ).trim();
}
async function user() {
  const email = `step42-${crypto.randomUUID()}@example.test`;
  const password = crypto.randomUUID();
  const created = await checked(
    admin.auth.admin.createUser({ email, password, email_confirm: true }),
  );
  users.push(created.user.id);
  const client = createClient(url, key, options);
  await checked(client.auth.signInWithPassword({ email, password }));
  await checked(
    client.rpc('complete_parent_onboarding', {
      child_name: 'PIN limit test',
      target_minutes: 60,
      parent_pin: '1234',
    }),
  );
  const profile = await checked(client.from('profiles').select('id').single());
  assert.match(profile.id, /^[0-9a-f-]{36}$/);
  return { client, parentId: profile.id };
}
function state(user) {
  return JSON.parse(
    sql(
      `select json_build_object('attempts', failed_attempts, 'until', locked_until, 'locked', coalesce(locked_until > clock_timestamp(), false)) from public.parent_pin_credentials where parent_id = '${user.parentId}'::uuid`,
    ),
  );
}
function expire(user) {
  // Test-only time fixture; no production clock/reset API is added.
  sql(
    `update public.parent_pin_credentials set locked_until = clock_timestamp() - interval '1 second' where parent_id = '${user.parentId}'::uuid`,
  );
}
const verify = (user, pin) => checked(user.client.rpc('verify_parent_pin', { parent_pin: pin }));
try {
  const a = await user();
  const b = await user();
  assert.equal(await verify(a, '1234'), true);
  assert.deepEqual(state(a), { attempts: 0, until: null, locked: false });
  for (let i = 1; i <= 4; i++) {
    assert.equal(await verify(a, '9999'), false);
    assert.equal(state(a).attempts, i);
  }
  assert.equal(await verify(a, '9999'), null);
  const locked = state(a);
  assert.equal(locked.attempts, 5);
  assert.equal(locked.locked, true);
  assert.ok(Date.parse(locked.until) - Date.now() > 290_000);
  assert.equal(await verify(a, '1234'), null);
  assert.deepEqual(state(a), locked);
  assert.deepEqual(state(b), { attempts: 0, until: null, locked: false });
  expire(a);
  assert.equal(await verify(a, '1234'), true);
  assert.deepEqual(state(a), { attempts: 0, until: null, locked: false });
  const parallel = await Promise.all(Array.from({ length: 4 }, () => verify(a, '9999')));
  assert.deepEqual(parallel, [false, false, false, false]);
  assert.equal(state(a).attempts, 4);
  assert.equal(await verify(a, '1234'), true);
  assert.equal(state(a).attempts, 0);
  const burst = await Promise.all(Array.from({ length: 12 }, () => verify(a, '9999')));
  assert.equal(burst.filter((value) => value === false).length, 4);
  assert.equal(burst.filter((value) => value === null).length, 8);
  assert.equal(state(a).attempts, 5);
  expire(a);
  assert.equal(await verify(a, '9999'), false);
  assert.deepEqual(state(a), { attempts: 1, until: null, locked: false });
  assert.equal(await verify(a, '1234'), true);
  const anon = createClient(url, key, options);
  assert.ok((await anon.rpc('verify_parent_pin', { parent_pin: '1234' })).error);
  assert.ok((await a.client.from('parent_pin_credentials').select('*')).error);
  assert.ok(
    (await a.client.rpc('verify_parent_pin', { parent_pin: '1234', parent_id: b.parentId })).error,
  );
  assert.deepEqual(state(b), { attempts: 0, until: null, locked: false });
  console.log(
    'PASS PIN: valid/reset, failures 1-4, fifth lock, correct PIN blocked during lock, expiry/reset',
  );
  console.log(
    'PASS PIN: concurrent HTTP failures (4 and 12 requests), no lost counts, expired wrong PIN starts at 1',
  );
  console.log(
    'PASS PIN: anon denied, credentials hidden, ownership parameter denied, user counters isolated',
  );
} finally {
  for (const id of users) await checked(admin.auth.admin.deleteUser(id));
}
