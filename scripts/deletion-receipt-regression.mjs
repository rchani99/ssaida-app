import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import ts from 'typescript';

function load(path, mocks = {}) {
  const mod = { exports: {} };
  new Function(
    'require',
    'module',
    'exports',
    ts.transpileModule(readFileSync(path, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS },
    }).outputText,
  )(
    (name) => {
      assert.ok(name in mocks, `Unexpected import ${name}`);
      return mocks[name];
    },
    mod,
    mod.exports,
  );
  return mod.exports;
}
const { createHandler, ActionError } = load('supabase/functions/account-actions/core.ts');
const { generateReceipt, hashReceipt } = load('supabase/functions/account-actions/receipt.ts');
const recoveryModule = load('src/features/auth/services/account-recovery-state.ts');
const { createSensitiveActionFlow } = load('src/features/auth/services/sensitive-action-flow.ts');
const user = '11111111-1111-4111-8111-111111111111';
const now = Date.now();
const challenge = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  user_id: user,
  google_sub: 'isolated',
  nonce: 'isolated-nonce',
  purpose: 'delete_account',
  status: 'pending',
  created_at: new Date(now).toISOString(),
  expires_at: new Date(now + 300000).toISOString(),
};
const capabilities = new Set(Array.from({ length: 128 }, generateReceipt));
assert.equal(capabilities.size, 128);
for (const receipt of capabilities) {
  assert.match(receipt, /^[a-f0-9]{64}$/);
  assert.notEqual(await hashReceipt(receipt), receipt);
}
const originalFetch = globalThis.fetch;
try {
  for (const mode of ['normal', 'response-lost', 'post-commit-error', 'status-wins-response']) {
    let authenticated = 0;
    let remoteDeleted = false;
    let verified = false;
    let consumed = false;
    let deletionCalls = 0;
    let disk = null;
    let session = user;
    let cleanups = 0;
    let failLocal = false;
    let failLookup = false;
    let lastReceipt;
    const operations = new Map();
    const handler = createHandler({
      audience: 'isolated',
      now: () => now,
      authenticate: async () => {
        authenticated++;
        if (remoteDeleted) throw new ActionError(401, 'AUTH_REQUIRED');
        return { id: user, googleSub: 'isolated' };
      },
      begin: async () => challenge,
      get: async () => challenge,
      verifyGoogle: async () => ({
        sub: 'isolated',
        nonce: challenge.nonce,
        auth_time: Math.floor(now / 1000),
        iat: Math.floor(now / 1000),
      }),
      verify: async () => {
        verified = true;
        return true;
      },
      cancel: async () => true,
      resetPin: async () => false,
      prepareDelete: async () => {
        assert.ok(verified);
        lastReceipt = {
          operationId: crypto.randomUUID(),
          receipt: generateReceipt(),
          expiresAt: new Date(now + 604800000).toISOString(),
        };
        operations.set(lastReceipt.operationId, {
          hash: await hashReceipt(lastReceipt.receipt),
          state: 'pending',
          expired: false,
        });
        return lastReceipt;
      },
      consumeDelete: async (_actor, _id, operationId) => {
        if (!verified || consumed || !operations.has(operationId)) return false;
        consumed = true;
        return true;
      },
      deleteUser: async () => {
        deletionCalls++;
        assert.equal(
          JSON.parse(disk).operation.receipt,
          lastReceipt.receipt,
          'receipt persisted before Admin deletion',
        );
        remoteDeleted = true;
        operations.get(lastReceipt.operationId).state = 'deleted'; // Real trigger covered by DB tests.
        if (mode === 'post-commit-error') throw new Error('connection lost after commit');
      },
      deletionStatus: async (id, receipt) => {
        if (failLookup) throw new Error('offline');
        const row = operations.get(id);
        return !row || row.expired || row.hash !== (await hashReceipt(receipt))
          ? 'expired'
          : row.state;
      },
    });
    const status = async (operation, extra = {}) =>
      handler(
        new Request('https://isolated.test/functions/v1/account-actions/status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            operationId: operation.operationId,
            receipt: operation.receipt,
            ...extra,
          }),
        }),
      );
    globalThis.fetch = async (url, options) => {
      assert.equal(url, 'https://isolated.test/functions/v1/account-actions/status');
      assert.equal(options.headers.Authorization, undefined);
      assert.equal(options.headers.authorization, undefined);
      assert.equal(options.headers.apikey, 'public-only');
      return handler(new Request(url, options));
    };
    const { fetchDeletionStatus } = load('src/features/auth/services/deletion-status.ts', {
      '@/config/environment': {
        getAppEnvironment: () => ({ url: 'https://isolated.test', publishableKey: 'public-only' }),
      },
    });
    const factory = () =>
      recoveryModule.createAccountRecovery({
        read: async () => disk,
        write: async (value) => {
          disk = value;
        },
        remove: async () => {
          disk = null;
        },
        currentUserId: async () => session,
        clearNotifications: async () => {
          if (failLocal) throw new Error('OS failure');
        },
        clearPreferences: async () => {
          cleanups++;
        },
        clearCache: async () => {},
        clearSession: async () => {
          session = null;
        },
        changed: () => {},
        deletionStatus: fetchDeletionStatus,
      });
    const recovery = factory();
    const { createAccountActions } = load('src/features/auth/services/account-actions.ts', {
      '@/features/auth/services/account-recovery': { accountRecovery: recovery },
      '@/features/auth/services/account-recovery-state': recoveryModule,
      '@/features/auth/services/sensitive-action-flow': { createSensitiveActionFlow },
      '@/features/notifications/storage': { registerDeletionCleanup: () => {} },
      '@/lib/supabase/client': {
        getSupabaseClient: () => ({
          auth: {
            getSession: async () => ({
              data: { session: session ? { user: { id: session } } : null },
            }),
          },
          functions: {
            invoke: async (_name, { body }) => {
              const response = await handler(
                new Request('https://isolated.test/functions/v1/account-actions', {
                  method: 'POST',
                  headers: { authorization: 'Bearer isolated', 'Content-Type': 'application/json' },
                  body: JSON.stringify(body),
                }),
              );
              if (mode === 'status-wins-response' && body.action === 'delete')
                await recovery.resume();
              if (mode === 'response-lost' && body.action === 'delete')
                return { error: new Error('response lost') };
              return response.ok
                ? { data: await response.json() }
                : { error: { context: response } };
            },
          },
        }),
      },
    });
    const actions = createAccountActions({ clearNotifications: async () => {} });
    await actions.begin('delete_account');
    await actions.verify('isolated-fresh-provider-proof');
    if (mode === 'normal' || mode === 'status-wins-response') {
      assert.equal(await actions.execute(), 'deleted');
      assert.equal(disk, null);
    } else {
      await assert.rejects(actions.execute());
      assert.equal(JSON.parse(disk).phase, 'unconfirmed');
      assert.equal(cleanups, 0);
      session = null; // No valid Auth session after deletion.
      failLookup = true;
      await assert.rejects(factory().resume(), /STATUS_UNAVAILABLE/);
      assert.equal(JSON.parse(disk).phase, 'unconfirmed');
      failLookup = false;
      const row = operations.get(lastReceipt.operationId);
      row.state = 'pending';
      await assert.rejects(factory().resume(), /DELETE_PENDING/);
      assert.equal(cleanups, 0);
      row.expired = true;
      await assert.rejects(factory().resume(), /DELETE_RECEIPT_EXPIRED/);
      assert.equal(cleanups, 0);
      row.expired = false;
      row.state = 'deleted';
      failLocal = true;
      await assert.rejects(factory().resume(), /OS failure/);
      assert.equal(JSON.parse(disk).phase, 'cleanup', 'confirmed phase durable before local steps');
      failLocal = false;
      const restarted = factory();
      await Promise.all([restarted.resume(), restarted.resume()]);
      assert.equal(disk, null);
    }
    assert.equal(cleanups, 1);
    assert.equal(deletionCalls, 1, 'status never resends Admin deletion');
    const authBefore = authenticated;
    for (let i = 0; i < 3; i++)
      assert.deepEqual(await (await status(lastReceipt)).json(), { status: 'deleted' });
    assert.equal(authenticated, authBefore, 'status works without Auth after local cleanup');
    assert.deepEqual(await (await status({ ...lastReceipt, receipt: generateReceipt() })).json(), {
      status: 'expired',
    });
    assert.deepEqual(
      await (await status({ ...lastReceipt, operationId: crypto.randomUUID() })).json(),
      { status: 'expired' },
    );
    assert.deepEqual(await (await status({ ...lastReceipt, receipt: undefined })).json(), {
      status: 'expired',
    });
    assert.deepEqual(await (await status(lastReceipt, { userId: user })).json(), {
      status: 'expired',
    });
    operations.get(lastReceipt.operationId).expired = true;
    assert.deepEqual(await (await status(lastReceipt)).json(), { status: 'expired' });
    assert.equal(
      (
        await handler(
          new Request('https://isolated.test/functions/v1/account-actions/status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': '16001' },
            body: '{}',
          }),
        )
      ).status,
      413,
    );
    await factory().resume();
    assert.equal(cleanups, 1, 'finished device remains a no-op');
  }
} finally {
  globalThis.fetch = originalFetch;
}
console.log(
  'PASS receipt recovery: real handlers/client adapter, durable prepare, normal/lost/post-commit responses, restart without Auth, pending/expiry/failure preservation, repeated status, capability isolation and 16KB limit',
);
