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
const { createDeletionExecutor } = load('supabase/functions/account-actions/executor.ts', {
  './core.ts': core,
});
const lease = { requestId: 'request', userId: 'owner', leaseToken: 'lease' };
function harness({
  cleanupFailure = false,
  authFailure = false,
  lostResponse = false,
  missingReceipt = false,
  failFailure = false,
} = {}) {
  const events = [];
  let done = false;
  const execute = createDeletionExecutor({
    completed: async () => done,
    prepare: async (value) => {
      assert.equal(value, lease);
      events.push('prepare');
      if (cleanupFailure) throw Error('private detail');
    },
    deleteAuth: async (id) => {
      assert.equal(id, 'owner');
      events.push('auth');
      if (authFailure) throw Error('provider details');
      done = !missingReceipt;
      if (lostResponse) throw Error('response lost');
    },
    fail: async (value, code) => {
      assert.equal(value, lease);
      events.push(code);
      if (failFailure) throw Error('DB unavailable');
    },
  });
  return { events, execute };
}
for (const options of [{}, { lostResponse: true }]) {
  const h = harness(options);
  await h.execute(lease);
  await h.execute(lease);
  assert.deepEqual(h.events, ['prepare', 'auth'], 'completion and retries never re-delete');
}
for (const options of [
  { cleanupFailure: true },
  { authFailure: true },
  { missingReceipt: true },
  { authFailure: true, failFailure: true },
]) {
  const h = harness(options);
  await assert.rejects(h.execute(lease), (e) => e.code === 'DELETE_FAILED' && e.status === 503);
  assert.deepEqual(
    h.events,
    options.cleanupFailure
      ? ['prepare', 'CLEANUP_FAILED']
      : ['prepare', 'auth', 'AUTH_DELETE_FAILED'],
  );
}
const proofId = '11111111-1111-4111-8111-111111111111';
let verified = 0;
const handler = core.createHandler({
  enabled: () => true,
  authenticate: async () => ({ id: 'verified-session-owner', googleSub: '' }),
  confirmDeletion: async (actor, id, token) => {
    assert.equal(actor.id, 'verified-session-owner');
    assert.equal(id, proofId);
    assert.equal(token, 'a'.repeat(64));
    verified++;
    return { state: 'GRACE', policyVersion: 'email-grace-v1' };
  },
});
const post = (body) =>
  handler(
    new Request('https://local.test/account-actions', {
      method: 'POST',
      headers: { Authorization: 'Bearer session', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
assert.equal(
  (await post({ action: 'confirm_deletion', proofId, token: 'a'.repeat(64) })).status,
  200,
  'Google reauth is not required',
);
for (const body of [
  { action: 'confirm_deletion', proofId, token: 'a'.repeat(64), emailVerified: true },
  { action: 'confirm_deletion', proofId, token: 'a'.repeat(64), userId: 'other' },
  { action: 'confirm_deletion', proofId, token: '123456' },
])
  assert.equal((await post(body)).status, 400);
assert.equal(verified, 1);
assert.equal(
  (await post({ action: 'begin', purpose: 'reset_parent_pin' })).status,
  403,
  'PIN Google identity boundary retained',
);
console.log(
  'PASS executor: cleanup-before-Auth, Auth failure, lost success response, missing receipt, repeated run, failed retry recording; email capability route rejects body authorization flags and preserves PIN boundary',
);
const { withCors } = load('supabase/functions/account-actions/cors.ts');
let invoked = 0;
const browser = withCors(async () => {
  invoked++;
  return Response.json({ ok: true });
}, 'https://allowed.test');
const preflight = (origin) =>
  browser(
    new Request('https://api.test/account-actions', {
      method: 'OPTIONS',
      headers: {
        Origin: origin,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'authorization,content-type,apikey',
      },
    }),
  );
assert.equal((await preflight('https://evil.test')).status, 403);
const allowed = await preflight('https://allowed.test');
assert.equal(allowed.status, 204);
assert.equal(allowed.headers.get('access-control-allow-origin'), 'https://allowed.test');
assert.equal(invoked, 0, 'preflight must not invoke account actions');
assert.equal(
  (await browser(new Request('https://api.test/account-actions', { method: 'POST' }))).status,
  200,
);
assert.equal(invoked, 1, 'native requests retain authorization in the handler');
console.log(
  'PASS browser boundary: exact CORS allowlist, preflight is read-only, native requests unaffected',
);
