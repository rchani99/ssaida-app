import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import ts from 'typescript';

function load(path, imports = {}) {
  const mod = { exports: {} };
  new Function(
    'require',
    'module',
    'exports',
    ts.transpileModule(readFileSync(path, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS },
    }).outputText,
  )(
    (id) => {
      assert.ok(id in imports, id);
      return imports[id];
    },
    mod,
    mod.exports,
  );
  return mod.exports;
}
const { createAccountRecovery } = load('src/features/auth/services/account-recovery-state.ts');
const user = '11111111-1111-4111-8111-111111111111';
const receipt = {
  operationId: '22222222-2222-4222-8222-222222222222',
  receipt: 'a'.repeat(64),
  expiresAt: new Date(Date.now() + 40 * 86400000).toISOString(),
};
let disk = null,
  session = user,
  status = 'pending',
  fail = false;
const events = [];
const factory = () =>
  createAccountRecovery({
    read: async () => disk,
    write: async (value) => {
      disk = value;
    },
    remove: async () => {
      disk = null;
    },
    currentUserId: async () => session,
    clearNotifications: async () => {
      events.push('notifications');
      if (fail) throw new Error('offline');
    },
    clearPreferences: async () => events.push('preferences'),
    clearCache: async () => events.push('cache'),
    clearSession: async () => {
      events.push('session');
      session = null;
    },
    changed() {},
    deletionStatus: async () => {
      if (status === 'offline') throw new Error('offline');
      return status;
    },
  });
await factory().watch(user, receipt);
await factory().resume();
assert.equal(JSON.parse(disk).phase, 'watching');
assert.deepEqual(events, [], 'waiting never removes local data');
status = 'offline';
await assert.rejects(factory().resume());
assert.deepEqual(events, []);
status = 'deleted';
fail = true;
await assert.rejects(factory().resume());
assert.equal(
  JSON.parse(disk).phase,
  'cleanup',
  'scheduled deletion confirmation survives cleanup failure',
);
fail = false;
await factory().resume();
assert.equal(disk, null);
assert.equal(session, null);
assert.deepEqual(events, ['notifications', 'notifications', 'preferences', 'cache', 'session']);

for (const terminal of ['failed', 'expired']) {
  session = user;
  status = terminal;
  events.length = 0;
  await factory().watch(user, receipt);
  await factory().resume();
  assert.equal(disk, null);
  assert.equal(session, user);
  assert.deepEqual(events, [], 'cancelled/expired watch never authorizes data deletion');
}
status = 'pending';
await factory().watch(user, receipt);
session = '33333333-3333-4333-8333-333333333333';
status = 'deleted';
await factory().resume();
assert.equal(JSON.parse(disk).phase, 'watching');
assert.deepEqual(events, [], 'a previous account watcher cannot sign out another account');
session = user;
await factory().prepare(user, receipt);
assert.equal(
  JSON.parse(disk).phase,
  'unconfirmed',
  'manual deletion upgrades the watch to a recovery gate',
);
await factory().leaveUnconfirmed();
assert.equal(disk, null);
assert.equal(session, null);
assert.deepEqual(
  events,
  ['cache', 'session'],
  'logout escape never reports deletion or removes preferences',
);

// A second device acquires only an existing request's read-only receipt, never begin/delete.
session = user;
status = 'pending';
events.length = 0;
const recovery = factory();
const calls = [];
const { ensureDeletionWatch } = load('src/features/auth/services/deletion-watch.ts', {
  '@/features/auth/services/account-recovery': { accountRecovery: recovery },
  '@/features/auth/services/account-recovery-state': load(
    'src/features/auth/services/account-recovery-state.ts',
  ),
  '@/lib/supabase/client': {
    getSupabaseClient: () => ({
      auth: { getSession: async () => ({ data: { session: { user: { id: session } } } }) },
      functions: {
        invoke: async (_name, { body }) => {
          calls.push(body.action);
          return { data: body.action === 'resume' ? { id: 'request' } : receipt };
        },
      },
    }),
  },
});
await Promise.all([ensureDeletionWatch(), ensureDeletionWatch()]);
await ensureDeletionWatch();
assert.deepEqual(calls, ['resume', 'watch_delete']);
assert.equal(JSON.parse(disk).phase, 'watching');
assert.deepEqual(events, []);

console.log(
  'PASS deletion MVP recovery: scheduled completion, restart/partial cleanup, offline/cancel/expiry, account isolation, explicit logout escape and second-device read-only watch',
);
