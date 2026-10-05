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
const core = load('supabase/functions/account-actions/core.ts');
const { createHandler, ActionError, readSmallJson, MAX_REQUEST_BYTES } = core;
const { createSensitiveActionFlow } = load('src/features/auth/services/sensitive-action-flow.ts');

// The Google proof contract must be gone from the server module, not merely unused.
assert.equal(core.validateGoogleClaims, undefined, 'auth_time validation removed');
const coreSource = readFileSync('supabase/functions/account-actions/core.ts', 'utf8');
for (const token of ['auth_time', 'idToken', 'verifyGoogle', 'nonce', 'audience'])
  assert.ok(!coreSource.includes(token), `core.ts still references ${token}`);

const now = Date.now();
const DAY = 86400000;
const actor = { id: '11111111-1111-4111-8111-111111111111', googleSub: 'google-a' };
const other = { id: '22222222-2222-4222-8222-222222222222', googleSub: 'google-b' };
const waiting = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  user_id: actor.id,
  purpose: 'delete_account',
  status: 'pending',
  created_at: new Date(now - 1000).toISOString(),
  available_at: new Date(now + 14 * DAY).toISOString(),
  expires_at: new Date(now + 21 * DAY).toISOString(),
};
const elapsed = (record) => ({
  ...record,
  created_at: new Date(now - 14 * DAY).toISOString(),
  available_at: new Date(now - 1000).toISOString(),
  expires_at: new Date(now + 7 * DAY).toISOString(),
});

let request = { ...waiting };
let requests = 0;
let deleted = false;
let adminFails = false;
let deletionCalls = 0;
let resetCalls = 0;
const operation = {
  operationId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  receipt: 'a'.repeat(64),
  expiresAt: new Date(now + 7 * DAY).toISOString(),
};
// Mirrors the RPC gate: pending, owned, right purpose, waiting period elapsed, not expired.
const usable = (who, id, purpose) =>
  who.id === request.user_id &&
  id === request.id &&
  request.purpose === purpose &&
  request.status === 'pending' &&
  Date.parse(request.available_at) <= now &&
  Date.parse(request.expires_at) > now;
const handler = createHandler({
  now: () => now,
  async authenticate(token) {
    if (token === 'b') return other;
    if (token !== 'a' || deleted) throw new ActionError(401, 'AUTH_REQUIRED');
    return actor;
  },
  async request(who, purpose) {
    requests++;
    // Idempotent, like the RPC: an existing pending window is returned unchanged.
    if (request.user_id === who.id && request.purpose === purpose && request.status === 'pending')
      return request;
    request = { ...waiting, user_id: who.id, purpose };
    return request;
  },
  async cancel(who, id) {
    if (who.id !== request.user_id || id !== request.id || request.status === 'consumed')
      return false;
    request = { ...request, status: 'cancelled' };
    return true;
  },
  async prepareDelete(who, id) {
    if (!usable(who, id, 'delete_account')) throw new ActionError(403, 'WAIT_REQUIRED');
    return operation;
  },
  async deletionStatus(operationId, receipt) {
    if (operationId !== operation.operationId || receipt !== operation.receipt) return 'expired';
    return deleted ? 'deleted' : 'pending';
  },
  async consumeDelete(who, id, operationId) {
    if (operationId !== operation.operationId || !usable(who, id, 'delete_account')) return false;
    request = { ...request, status: 'consumed' };
    return true;
  },
  async deleteUser(who) {
    deletionCalls++;
    assert.equal(who.id, actor.id);
    if (adminFails) throw new Error('private admin error');
    deleted = true;
  },
  async resetPin(who, id) {
    if (!usable(who, id, 'reset_parent_pin')) return false;
    request = { ...request, status: 'consumed' };
    resetCalls++;
    return true;
  },
});
const call = (body, token = 'a') =>
  handler(
    new Request('https://local.test', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(
        body.action === 'delete' ? { operationId: operation.operationId, ...body } : body,
      ),
    }),
  );
const id = waiting.id;

// The removed verification actions must not be reachable under any name.
for (const action of ['verify', 'verify_code'])
  assert.equal((await call({ action, id, idToken: 'fresh-signed-token' })).status, 400);

const started = await (await call({ action: 'begin', purpose: 'delete_account' })).json();
assert.deepEqual(Object.keys(started).sort(), ['availableAt', 'expiresAt', 'id', 'purpose']);
assert.equal(started.availableAt, waiting.available_at, 'server-issued window, not client-chosen');
// Asking again must not restart, shorten or extend the window.
const repeated = await (await call({ action: 'begin', purpose: 'delete_account' })).json();
assert.deepEqual(repeated, started);
assert.equal(requests, 2);

// Nothing is executable while the waiting period is still running.
assert.equal((await call({ action: 'delete', id })).status, 403);
assert.equal((await call({ action: 'prepare_delete', id })).status, 403);
assert.equal((await call({ action: 'delete', id, userId: other.id })).status, 400);

request = elapsed(request);
assert.equal(
  (await call({ action: 'reset_pin', id, newPin: '5678' })).status,
  403,
  'wrong purpose',
);
assert.equal((await call({ action: 'delete', id }, 'b')).status, 403, 'foreign account');
await call({ action: 'cancel', id });
assert.equal((await call({ action: 'delete', id })).status, 403, 'cancelled request');

request = elapsed({ ...waiting, status: 'pending' });
adminFails = true;
const failure = await call({ action: 'delete', id });
assert.equal(failure.status, 503);
assert.ok(!(await failure.text()).includes('private admin error'));
assert.equal(
  (await call({ action: 'delete', id })).status,
  403,
  'claimed request is not replayable',
);
adminFails = false;

request = elapsed({ ...waiting, purpose: 'reset_parent_pin', status: 'pending' });
assert.equal((await call({ action: 'reset_pin', id, newPin: '5678' }, 'b')).status, 403);
assert.equal((await call({ action: 'reset_pin', id, newPin: '12' })).status, 400);
assert.equal((await call({ action: 'reset_pin', id, newPin: '5678' })).status, 200);
assert.equal((await call({ action: 'reset_pin', id, newPin: '5678' })).status, 403);
assert.equal(resetCalls, 1);

request = elapsed({ ...waiting, status: 'pending' });
assert.equal((await call({ action: 'delete', id })).status, 200);
assert.equal((await call({ action: 'delete', id })).status, 401, 'deleted user cannot reuse a JWT');
assert.equal(deletionCalls, 2);

let cleanup = 0;
let clientUser = actor.id;
let failDelete = false;
let lastBody;
let clientAvailableAt = new Date(now + 14 * DAY).toISOString();
const controller = () =>
  createSensitiveActionFlow({
    now: () => now,
    currentUserId: async () => clientUser,
    async invoke(body) {
      lastBody = body;
      if (body.action === 'begin')
        return {
          id,
          purpose: body.purpose,
          availableAt: clientAvailableAt,
          expiresAt: new Date(now + 21 * DAY).toISOString(),
        };
      if (body.action === 'delete' && failDelete) throw new Error('network');
      return {
        status: { cancel: 'cancelled', delete: 'deleted', reset_pin: 'pin_reset' }[body.action],
      };
    },
    async cleanupDeletedAccount(owner) {
      assert.equal(owner, actor.id);
      cleanup++;
    },
  });
const flow = controller();
await assert.rejects(flow.execute(), /WAIT_REQUIRED/, 'nothing to execute before a request');
await flow.begin('delete_account');
await assert.rejects(flow.execute(), /WAIT_REQUIRED/, 'client refuses to call during the wait');
clientAvailableAt = new Date(now - 1000).toISOString();
await flow.begin('delete_account');
failDelete = true;
await assert.rejects(flow.execute());
assert.equal(cleanup, 0); // Session and storage remain intact.
await assert.rejects(flow.execute(), /WAIT_REQUIRED/);
failDelete = false;
await flow.begin('delete_account');
await flow.cancel();
await assert.rejects(flow.execute(), /WAIT_REQUIRED/);
await flow.begin('delete_account');
clientUser = other.id;
await assert.rejects(flow.execute(), /ACCOUNT_CHANGED/);
assert.equal(cleanup, 0);
clientUser = actor.id;
await flow.begin('delete_account');
await flow.execute();
assert.equal(cleanup, 1);
assert.deepEqual(lastBody, { action: 'delete', id });
const pinFlow = controller();
await pinFlow.begin('reset_parent_pin');
await assert.rejects(pinFlow.execute('12'), /INVALID_PIN/);
await pinFlow.execute('5678');
assert.equal(cleanup, 1);
await assert.rejects(pinFlow.execute('5678'), /WAIT_REQUIRED/);
// An expired action window cannot be executed even though the wait is over.
const stale = createSensitiveActionFlow({
  now: () => now,
  currentUserId: async () => actor.id,
  invoke: async (body) =>
    body.action === 'begin'
      ? {
          id,
          purpose: body.purpose,
          availableAt: new Date(now - 2000).toISOString(),
          expiresAt: new Date(now - 1000).toISOString(),
        }
      : { status: 'deleted' },
  cleanupDeletedAccount: async () => {
    throw new Error('Unexpected cleanup');
  },
});
await stale.begin('delete_account');
await assert.rejects(stale.execute(), /REQUEST_EXPIRED/);

// A cancelled flow must never execute when an in-flight response arrives.
let finishCancel;
let cancelCalls = 0;
const pending = createSensitiveActionFlow({
  now: () => now,
  currentUserId: async () => actor.id,
  async invoke(body) {
    if (body.action === 'begin')
      return {
        id,
        purpose: body.purpose,
        availableAt: new Date(now - 1000).toISOString(),
        expiresAt: new Date(now + 7 * DAY).toISOString(),
      };
    if (body.action === 'cancel') {
      cancelCalls++;
      return await new Promise((resolve) => {
        finishCancel = resolve;
      });
    }
    throw new Error('Cancelled flow executed');
  },
  cleanupDeletedAccount: async () => {
    throw new Error('Unexpected cleanup');
  },
});
await pending.begin('delete_account');
const cancelling = pending.cancel();
await new Promise((resolve) => setImmediate(resolve));
finishCancel({ status: 'cancelled' });
await cancelling;
await assert.rejects(pending.execute(), /WAIT_REQUIRED/);
assert.equal(cancelCalls, 1);

const cleanupEvents = [];
let sdkDeleteFails = false;
let sdkResponseLost = false;
let localSession = actor.id;
let marker = null;
let drain;
const { createAccountRecovery, isDeletionReceipt } = load(
  'src/features/auth/services/account-recovery-state.ts',
);
const recovery = createAccountRecovery({
  read: async () => marker,
  write: async (value) => {
    marker = value;
  },
  remove: async () => {
    marker = null;
  },
  currentUserId: async () => localSession,
  clearNotifications: async (owner) => drain(owner),
  clearPreferences: async () => cleanupEvents.push('removePreferences'),
  clearCache: async () => cleanupEvents.push('cancelQueries', 'clearCache', 'childMode'),
  clearSession: async () => {
    cleanupEvents.push('removeSession');
    localSession = null;
  },
  changed: () => {},
});
const { createAccountActions } = load('src/features/auth/services/account-actions.ts', {
  '@/features/auth/services/account-recovery-state': { isDeletionReceipt },
  '@/features/auth/services/account-recovery': { accountRecovery: recovery },
  '@/features/notifications/storage': {
    registerDeletionCleanup: (fn) => {
      drain = fn;
    },
  },
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
          if (body.action === 'prepare_delete') return { data: operation, error: null };
          if (body.action === 'delete') {
            assert.equal(body.operationId, operation.operationId);
            assert.equal(
              JSON.parse(marker).operation.receipt,
              operation.receipt,
              'receipt durable BEFORE deletion',
            );
            assert.equal(body.receipt, undefined, 'receipt never authorizes deletion');
          }
          if (body.action === 'delete' && sdkResponseLost)
            return { error: new Error('response lost') };
          if (body.action === 'delete' && sdkDeleteFails)
            return {
              error: { context: Response.json({ code: 'WAIT_REQUIRED' }, { status: 403 }) },
            };
          return {
            data:
              body.action === 'begin'
                ? {
                    id,
                    purpose: body.purpose,
                    availableAt: new Date(now - 1000).toISOString(),
                    expiresAt: new Date(now + 7 * DAY).toISOString(),
                  }
                : { status: 'deleted' },
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
});
await bound.begin('delete_account');
sdkDeleteFails = true;
await assert.rejects(bound.execute());
assert.deepEqual(cleanupEvents, []);
assert.equal(localSession, actor.id);
assert.equal(marker, null, 'definitive pre-delete rejection permits a new request');
sdkDeleteFails = false;
await bound.begin('delete_account');
await bound.execute();
assert.deepEqual(cleanupEvents, [
  'notificationsAndStorage',
  'removePreferences',
  'cancelQueries',
  'clearCache',
  'childMode',
  'removeSession',
]);
assert.equal(localSession, null);
assert.equal(marker, null, 'marker removed only after every cleanup step');
localSession = actor.id;
cleanupEvents.length = 0;
await bound.begin('delete_account');
sdkResponseLost = true;
await assert.rejects(bound.execute());
assert.equal(JSON.parse(marker).phase, 'unconfirmed');
assert.deepEqual(cleanupEvents, []);
localSession = null;
await assert.rejects(recovery.resume(), /DELETE_OUTCOME_UNKNOWN/);
await assert.rejects(bound.begin('delete_account'), /AUTH_REQUIRED/);
localSession = actor.id;
await assert.rejects(bound.begin('delete_account'), /RECOVERY_REQUIRED/);
assert.ok(
  marker,
  'expired/deleted session never converts an unknown response into confirmed deletion',
);

// Enforce bytes while streaming, independent of an absent or dishonest Content-Length.
const jsonRequest = (body, headers = {}) =>
  new Request('https://local.test', {
    method: 'POST',
    body,
    headers: { 'content-type': 'application/json', ...headers },
    duplex: 'half',
  });
assert.deepEqual(await readSmallJson(jsonRequest('{"ok":true}')), { ok: true });
assert.deepEqual(await readSmallJson(jsonRequest('{"ok":true}', { 'content-length': '11' })), {
  ok: true,
});
await assert.rejects(
  readSmallJson(jsonRequest('{}', { 'content-length': String(MAX_REQUEST_BYTES + 1) })),
  (error) => error.status === 413,
);
await assert.rejects(
  readSmallJson(jsonRequest('{}', { 'content-length': '1' })),
  (error) => error.status === 400,
);
await assert.rejects(
  readSmallJson(jsonRequest('{}', { 'content-type': 'text/plain' })),
  (error) => error.status === 415,
);
await assert.rejects(
  readSmallJson(jsonRequest('{}', { 'content-encoding': 'gzip' })),
  (error) => error.status === 415,
);
for (const headers of [{}, { 'content-length': '1' }]) {
  let cancelledStream = false;
  const stream = new ReadableStream(
    {
      pull(controller) {
        controller.enqueue(new TextEncoder().encode('가'.repeat(3000)));
      },
      cancel() {
        cancelledStream = true;
      },
    },
    { highWaterMark: 0 },
  );
  await assert.rejects(
    readSmallJson(jsonRequest(stream, headers)),
    (error) => error.status === 413,
  );
  assert.ok(cancelledStream);
}
const tooLarge = new Request('https://local.test', {
  method: 'POST',
  body: '{}',
  headers: {
    authorization: 'Bearer a',
    'content-type': 'application/json',
    'content-length': '999999999',
  },
});
assert.equal((await handler(tooLarge)).status, 413, 'size checked before authentication/body read');
console.log(
  'PASS account actions: waiting period is server-issued and idempotent, nothing executes early, ownership/purpose/cancellation/expiry/replay enforced, deleted-user rejection; client failure preserves data and success cleans once (Admin adapter mocked)',
);
