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
const { createPurgeHandler } = load('supabase/functions/account-actions/purge.ts', {
  './core.ts': core,
});

const secret = 'scheduler-secret-value';
function harness(overrides = {}) {
  const state = {
    queue: [],
    deletions: [],
    failFor: null,
    claims: 0,
    clock: 0,
    perCall: 0,
  };
  const handler = createPurgeHandler({
    secret,
    now: () => {
      state.clock += state.perCall;
      return state.clock;
    },
    claim: async () => {
      state.claims++;
      return state.queue.shift() ?? null;
    },
    due: async () => state.queue.length,
    deleteUser: async (userId) => {
      if (userId === state.failFor) throw new Error('private admin error');
      state.deletions.push(userId);
    },
    ...overrides,
  });
  return { state, handler };
}
const post = (handler, token = secret, method = 'POST') =>
  handler(
    new Request('https://local.test/functions/v1/account-actions/purge', {
      method,
      headers: token === null ? {} : { authorization: `Bearer ${token}` },
    }),
  );

// Only the scheduler secret opens this route; no user session can reach it.
{
  const { handler, state } = harness();
  state.queue.push('user-a');
  assert.equal((await post(handler, null)).status, 401, 'missing bearer');
  assert.equal((await post(handler, 'wrong-secret-value!!')).status, 401, 'same length, wrong');
  assert.equal((await post(handler, 'short')).status, 401, 'shorter secret');
  assert.equal((await post(handler, `${secret}x`)).status, 401, 'prefix is not enough');
  assert.equal((await post(handler, secret, 'GET')).status, 405, 'POST only');
  assert.deepEqual(state.deletions, [], 'nothing deleted without the secret');
  assert.equal(state.claims, 0, 'rejected requests never claim');
}

// An unset secret disables the route rather than defaulting to open.
{
  const { handler, state } = harness({ secret: undefined });
  const response = await post(handler);
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, 'NOT_CONFIGURED');
  assert.equal(state.claims, 0);
}

// Drains every due account, then stops when the claim returns null.
{
  const { handler, state } = harness();
  state.queue.push('user-a', 'user-b', 'user-c');
  const body = await (await post(handler)).json();
  assert.deepEqual(body, { deleted: 3, due: 0 });
  assert.deepEqual(state.deletions, ['user-a', 'user-b', 'user-c']);
  assert.equal(state.claims, 4, 'one extra claim detects the empty queue');
}

// Nothing due is a successful no-op, not an error.
{
  const { handler } = harness();
  const response = await post(handler);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { deleted: 0, due: 0 });
}

// An Admin failure stops the run and is reported without leaking the error or the account.
{
  const { handler, state } = harness();
  state.queue.push('user-a', 'user-b', 'user-c');
  state.failFor = 'user-b';
  const response = await post(handler);
  const text = await response.text();
  assert.equal(response.status, 200);
  assert.deepEqual(JSON.parse(text), { deleted: 1, due: 1, stopped: 'DELETE_FAILED' });
  assert.ok(!text.includes('private admin error'));
  assert.ok(!text.includes('user-b'));
  assert.deepEqual(state.deletions, ['user-a'], 'the failed account is not skipped past');
}

// Per-invocation caps keep a scheduler timeout from cutting a deletion mid-flight.
{
  const { handler, state } = harness({ maxDeletions: 2 });
  state.queue.push('user-a', 'user-b', 'user-c');
  assert.deepEqual(await (await post(handler)).json(), { deleted: 2, due: 1 });
  assert.deepEqual(state.deletions, ['user-a', 'user-b']);
}
{
  const { handler, state } = harness({ budgetMs: 10 });
  state.queue.push('user-a', 'user-b', 'user-c');
  state.perCall = 6; // Each now() reading advances past the budget.
  const body = await (await post(handler)).json();
  assert.ok(body.deleted < 3, 'budget interrupts the drain');
  assert.equal(body.deleted, state.deletions.length);
}

// A growing due count is the operational signal that the job is not running.
{
  const { handler, state } = harness({ maxDeletions: 1 });
  state.queue.push('user-a', 'user-b');
  assert.deepEqual(await (await post(handler)).json(), { deleted: 1, due: 1 });
}

const purgeSource = readFileSync('supabase/functions/account-actions/purge.ts', 'utf8');
for (const token of ['getUser', 'SERVICE_ROLE', 'console.'])
  assert.ok(!purgeSource.includes(token), `purge.ts must not reference ${token}`);

console.log(
  'PASS deletion purge: scheduler secret required and compared whole, unset secret disables the route, drains due accounts, Admin failure stops and stays retryable, deletion/time caps honoured, due count reported',
);
