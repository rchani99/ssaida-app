import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import ts from 'typescript';

const module = { exports: {} };
new Function(
  'module',
  'exports',
  ts.transpileModule(readFileSync('src/features/auth/services/account-recovery-state.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText,
)(module, module.exports);
const { createAccountRecovery } = module.exports;
const user = '11111111-1111-4111-8111-111111111111';
let disk = null;
let session = user;
let failing = '';
const events = [];
const step = async (name) => {
  events.push(name);
  if (failing === name) throw new Error(name);
};
const factory = () =>
  createAccountRecovery({
    read: async () => disk,
    write: async (value) => {
      await step('write');
      disk = value;
    },
    remove: async () => {
      await step('remove');
      disk = null;
    },
    currentUserId: async () => session,
    clearNotifications: async () => step('notifications'),
    clearPreferences: async (owner) => {
      assert.equal(owner, user);
      await step('preferences');
    },
    clearCache: async () => step('cache'),
    clearSession: async () => {
      await step('session');
      session = null;
    },
    changed: () => {},
  });
for (const failure of ['', 'notifications', 'preferences', 'cache', 'session', 'remove']) {
  disk = null;
  session = user;
  failing = '';
  events.length = 0;
  const first = factory();
  await first.prepare(user);
  assert.deepEqual(JSON.parse(disk), { version: 1, phase: 'unconfirmed', userId: user });
  await assert.rejects(first.resume(), /DELETE_OUTCOME_UNKNOWN/);
  assert.ok(!events.includes('notifications'));
  await first.confirmed(user);
  failing = failure;
  if (failure) {
    await assert.rejects(first.resume());
    assert.equal(JSON.parse(disk).phase, 'cleanup');
  } else await first.resume();
  // Fresh instance simulates restart; only persisted marker survives, no proof or token.
  failing = '';
  const restarted = factory();
  await Promise.all([restarted.resume(), restarted.resume()]);
  assert.equal(disk, null);
  assert.equal(session, null);
  const completedEvents = [...events];
  await restarted.resume();
  assert.deepEqual(events, completedEvents, 'completed recovery is a no-op');
}
disk = null;
session = user;
events.length = 0;
const lostResponse = factory();
await lostResponse.prepare(user);
session = null; // Deleted/expired/missing session is NOT evidence of successful remote deletion.
await assert.rejects(factory().resume(), /DELETE_OUTCOME_UNKNOWN/);
assert.equal(JSON.parse(disk).phase, 'unconfirmed');
assert.deepEqual(events, ['write']);
await assert.rejects(factory().prepare(user), /RECOVERY_REQUIRED/);

disk = null;
session = user;
failing = 'write';
events.length = 0;
await assert.rejects(factory().prepare(user));
assert.equal(disk, null, 'request must not be sent if its recovery marker cannot be saved');
failing = '';
const confirmationWriteFailure = factory();
await confirmationWriteFailure.prepare(user);
failing = 'write';
await assert.rejects(confirmationWriteFailure.confirmed(user));
failing = '';
assert.equal(JSON.parse(disk).phase, 'unconfirmed');
events.length = 0;
await assert.rejects(factory().resume(), /DELETE_OUTCOME_UNKNOWN/);
assert.deepEqual(events, [], 'lost durable confirmation must not authorize data removal');
disk = null;
const mismatch = factory();
await mismatch.prepare(user);
await mismatch.confirmed(user);
session = '22222222-2222-4222-8222-222222222222';
events.length = 0;
await assert.rejects(mismatch.resume(), /ACCOUNT_CHANGED/);
assert.deepEqual(events, []);
assert.ok(disk);

disk = '{"version":1,"phase":"cleanup","userId":"invalid","token":"forbidden"}';
await assert.rejects(factory().resume(), /RECOVERY_STATE_INVALID/);
console.log(
  'PASS durable recovery: confirmed cleanup, every partial failure, restart, no-proof/idempotent retries, unknown response preserves data, write failure and cross-account guards',
);
