import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import ts from 'typescript';

function load(path, mocks = {}) {
  const module = { exports: {} };
  new Function(
    'require',
    'module',
    'exports',
    ts.transpileModule(readFileSync(path, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS },
    }).outputText,
  )(
    (id) => {
      if (id in mocks) return mocks[id];
      throw new Error(`Unexpected import ${id}`);
    },
    module,
    module.exports,
  );
  return module.exports;
}
const { createHandler, validateGoogleClaims, ActionError } = load(
  'supabase/functions/account-actions/core.ts',
);
const { createSensitiveActionFlow } = load('src/features/auth/services/sensitive-action-flow.ts');
const now = Date.now();
const actor = { id: 'user-a', googleSub: 'google-a' };
const other = { id: 'user-b', googleSub: 'google-b' };
const initial = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  user_id: actor.id,
  google_sub: actor.googleSub,
  nonce: 'random-provider-nonce',
  purpose: 'delete_account',
  status: 'pending',
  created_at: new Date(now - 1000).toISOString(),
  expires_at: new Date(now + 60000).toISOString(),
};
const claims = {
  sub: actor.googleSub,
  nonce: initial.nonce,
  auth_time: Math.floor(now / 1000),
  iat: Math.floor(now / 1000),
};
assert.ok(validateGoogleClaims(claims, initial, actor, 'client', now));
for (const bad of [
  { ...claims, auth_time: undefined },
  { ...claims, auth_time: Math.floor(now / 1000) - 3600 },
  { ...claims, auth_time: Math.floor(now / 1000) + 60 },
  { ...claims, nonce: 'replayed' },
  { ...claims, sub: other.googleSub },
  { ...claims, azp: 'foreign-client' },
])
  assert.throws(() => validateGoogleClaims(bad, initial, actor, 'client', now), /REAUTH_REQUIRED/);
assert.throws(() => validateGoogleClaims(claims, initial, other, 'client', now), /REAUTH_REQUIRED/);
assert.throws(() =>
  validateGoogleClaims(
    claims,
    { ...initial, expires_at: new Date(now - 1).toISOString() },
    actor,
    'client',
    now,
  ),
);

let challenge = { ...initial };
let deleted = false;
let adminFails = false;
let deletionCalls = 0;
let resetCalls = 0;
const handler = createHandler({
  audience: 'client',
  now: () => now,
  async authenticate(token) {
    if (token === 'b') return other;
    if (token !== 'a' || deleted) throw new ActionError(401, 'AUTH_REQUIRED');
    return actor;
  },
  async begin(who, purpose) {
    challenge = { ...initial, user_id: who.id, purpose };
    return challenge;
  },
  async get(who, id) {
    if (who.id !== challenge.user_id || id !== challenge.id)
      throw new ActionError(403, 'REAUTH_REQUIRED');
    return challenge;
  },
  async verifyGoogle(token) {
    if (token !== 'fresh-signed-token') throw new Error('invalid signature');
    return claims;
  },
  async verify(who, id) {
    if (who.id !== challenge.user_id || id !== challenge.id || challenge.status !== 'pending')
      return false;
    challenge.status = 'verified';
    return true;
  },
  async cancel(who, id) {
    if (who.id !== challenge.user_id || id !== challenge.id || challenge.status === 'consumed')
      return false;
    challenge.status = 'cancelled';
    return true;
  },
  async consumeDelete(who, id) {
    if (
      who.id !== challenge.user_id ||
      id !== challenge.id ||
      challenge.purpose !== 'delete_account' ||
      challenge.status !== 'verified'
    )
      return false;
    challenge.status = 'consumed';
    return true;
  },
  async deleteUser(who) {
    deletionCalls++;
    assert.equal(who.id, actor.id);
    if (adminFails) throw new Error('private admin error');
    deleted = true;
  },
  async resetPin(who, id) {
    if (
      who.id !== challenge.user_id ||
      id !== challenge.id ||
      challenge.purpose !== 'reset_parent_pin' ||
      challenge.status !== 'verified'
    )
      return false;
    challenge.status = 'consumed';
    resetCalls++;
    return true;
  },
});
const call = (body, token = 'a') =>
  handler(
    new Request('https://local.test', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    }),
  );
const id = initial.id;
assert.equal((await call({ action: 'delete', id })).status, 403);
assert.equal((await call({ action: 'delete', id, userId: other.id })).status, 400);
assert.equal((await call({ action: 'verify', id, idToken: 'session-refresh' })).status, 403);
assert.equal(
  (await call({ action: 'verify', id, idToken: 'fresh-signed-token' }, 'b')).status,
  403,
);
assert.equal((await call({ action: 'verify', id, idToken: 'fresh-signed-token' })).status, 200);
assert.equal((await call({ action: 'reset_pin', id, newPin: '5678' })).status, 403);
assert.equal((await call({ action: 'delete', id }, 'b')).status, 403);
await call({ action: 'cancel', id });
assert.equal((await call({ action: 'delete', id })).status, 403);
assert.equal((await call({ action: 'verify', id, idToken: 'fresh-signed-token' })).status, 403);
challenge = { ...initial, status: 'verified' };
adminFails = true;
const failure = await call({ action: 'delete', id });
assert.equal(failure.status, 503);
assert.ok(!(await failure.text()).includes('private admin error'));
assert.equal((await call({ action: 'delete', id })).status, 403);
adminFails = false;
challenge = { ...initial, status: 'verified', purpose: 'reset_parent_pin' };
assert.equal((await call({ action: 'reset_pin', id, newPin: '5678' }, 'b')).status, 403);
assert.equal((await call({ action: 'reset_pin', id, newPin: '5678' })).status, 200);
assert.equal((await call({ action: 'reset_pin', id, newPin: '5678' })).status, 403);
assert.equal(resetCalls, 1);
challenge = { ...initial, status: 'verified' };
assert.equal((await call({ action: 'delete', id })).status, 200);
assert.equal((await call({ action: 'delete', id })).status, 401);
assert.equal(deletionCalls, 2);

let cleanup = 0;
let clientUser = actor.id;
let failDelete = false;
let lastBody;
const controller = () =>
  createSensitiveActionFlow({
    currentUserId: async () => clientUser,
    async invoke(body) {
      lastBody = body;
      if (body.action === 'begin')
        return { id, nonce: 'nonce', expiresAt: initial.expires_at, audience: 'client' };
      if (body.action === 'delete' && failDelete) throw new Error('network');
      return {
        status: {
          verify: 'verified',
          cancel: 'cancelled',
          delete: 'deleted',
          reset_pin: 'pin_reset',
        }[body.action],
      };
    },
    async cleanupDeletedAccount(owner) {
      assert.equal(owner, actor.id);
      cleanup++;
    },
  });
const flow = controller();
await flow.begin('delete_account');
await assert.rejects(flow.execute(), /REAUTH_REQUIRED/);
await flow.verify('fresh-signed-token');
failDelete = true;
await assert.rejects(flow.execute());
assert.equal(cleanup, 0); // Session and storage remain intact.
await assert.rejects(flow.execute(), /REAUTH_REQUIRED/);
failDelete = false;
await flow.begin('delete_account');
await flow.verify('fresh-signed-token');
await flow.cancel();
await assert.rejects(flow.execute(), /REAUTH_REQUIRED/);
await flow.begin('delete_account');
await flow.verify('fresh-signed-token');
clientUser = other.id;
await assert.rejects(flow.execute(), /ACCOUNT_CHANGED/);
assert.equal(cleanup, 0);
clientUser = actor.id;
await flow.begin('delete_account');
await flow.verify('fresh-signed-token');
await flow.execute();
assert.equal(cleanup, 1);
assert.deepEqual(lastBody, { action: 'delete', id });
const pinFlow = controller();
await pinFlow.begin('reset_parent_pin');
await pinFlow.verify('fresh-signed-token');
await pinFlow.execute('5678');
assert.equal(cleanup, 1);
await assert.rejects(pinFlow.execute('5678'), /REAUTH_REQUIRED/);

// A cancelled in-flight verification must never re-enable execution when its response arrives.
let finishVerification;
let cancelCalls = 0;
const pending = createSensitiveActionFlow({
  currentUserId: async () => actor.id,
  async invoke(body) {
    if (body.action === 'begin')
      return { id, nonce: 'nonce', expiresAt: initial.expires_at, audience: 'client' };
    if (body.action === 'verify')
      return await new Promise((resolve) => {
        finishVerification = resolve;
      });
    if (body.action === 'cancel') {
      cancelCalls++;
      return { status: 'cancelled' };
    }
    throw new Error('Cancelled flow executed');
  },
  cleanupDeletedAccount: async () => {
    throw new Error('Unexpected cleanup');
  },
});
await pending.begin('delete_account');
const verifying = pending.verify('fresh-signed-token');
await Promise.resolve();
await pending.cancel();
finishVerification({ status: 'verified' });
await assert.rejects(verifying, /REAUTH_REQUIRED/);
await assert.rejects(pending.execute(), /REAUTH_REQUIRED/);
assert.equal(cancelCalls, 1);

const cleanupEvents = [];
let sdkDeleteFails = false;
let localSession = actor.id;
const { createAccountActions } = load('src/features/auth/services/account-actions.ts', {
  '@/features/auth/services/sensitive-action-flow': { createSensitiveActionFlow },
  '@/lib/query-client': {
    queryClient: {
      cancelQueries: async () => cleanupEvents.push('cancelQueries'),
      clear: () => cleanupEvents.push('clearCache'),
    },
  },
  '@/store/app-mode.store': {
    useAppModeStore: { getState: () => ({ setMode: () => cleanupEvents.push('childMode') }) },
  },
  '@/lib/supabase/client': {
    getSupabaseClient: () => ({
      auth: {
        getSession: async () => ({
          data: { session: localSession ? { user: { id: localSession } } : null },
        }),
        signOut: async ({ scope }) => {
          assert.equal(scope, 'local');
          cleanupEvents.push('removeSession');
          localSession = null;
          return { error: null };
        },
      },
      functions: {
        invoke: async (_name, { body }) => {
          if (body.action === 'delete' && sdkDeleteFails)
            return { error: new Error('server failed') };
          return {
            data:
              body.action === 'begin'
                ? { id, nonce: 'nonce', expiresAt: initial.expires_at, audience: 'client' }
                : { status: body.action === 'verify' ? 'verified' : 'deleted' },
            error: null,
          };
        },
      },
    }),
  },
});
const bound = createAccountActions({
  clearNotifications: async (owner) => {
    assert.equal(owner, actor.id);
    cleanupEvents.push('notificationsAndStorage');
  },
  onSignedOut: () => cleanupEvents.push('login'),
});
await bound.begin('delete_account');
await bound.verify('fresh-signed-token');
sdkDeleteFails = true;
await assert.rejects(bound.execute());
assert.deepEqual(cleanupEvents, []);
assert.equal(localSession, actor.id);
sdkDeleteFails = false;
await bound.begin('delete_account');
await bound.verify('fresh-signed-token');
await bound.execute();
assert.deepEqual(cleanupEvents, [
  'notificationsAndStorage',
  'cancelQueries',
  'clearCache',
  'childMode',
  'removeSession',
  'login',
]);
assert.equal(localSession, null);
console.log(
  'PASS account actions: ownership, purpose, fresh auth_time, nonce, cancellation, expiry, replay, deleted-user rejection; client failure preserves data and success cleans once (provider/Admin adapters mocked)',
);
