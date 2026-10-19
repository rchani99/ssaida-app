import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
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
      throw Error(`Unexpected import ${id}`);
    },
    module,
    module.exports,
  );
  return module.exports;
}
const core = load('supabase/functions/account-actions/core.ts');
const receipts = load('supabase/functions/account-actions/receipt.ts');
const crypt = load('supabase/functions/account-actions/email-crypto.ts', {
  './receipt.ts': receipts,
});
const { createEmailHandler } = load('supabase/functions/account-actions/email.ts', {
  './core.ts': core,
});
const mail = load('supabase/functions/account-actions/email-mailer.ts');
const c = crypt.createEmailCrypto(randomBytes(32).toString('hex'), randomBytes(32).toString('hex'));
assert.throws(() => crypt.createEmailCrypto('short', 'short'));
for (let i = 0; i < 100; i++) assert.match(c.code(), /^\d{8}$/);
const id = crypto.randomUUID(),
  message = { email: 'fixture@example.test', code: '01234567' };
const cipher = await c.seal(id, message);
assert.ok(!cipher.includes(message.email) && !cipher.includes(message.code));
assert.deepEqual(await c.open(id, cipher), message);
await assert.rejects(
  c.open(crypto.randomUUID(), cipher),
  'ciphertext cannot move to a different request',
);
assert.notEqual(
  await c.tag('code', id + ':' + message.code),
  await c.tag('email', id + ':' + message.code),
);
assert.notEqual(
  await c.tag('code', id + ':' + message.code),
  await c.tag('code', 'different:' + message.code),
);
assert.equal(mail.isLocalMockEnabled('mock', 'https://project.supabase.co'), false);
assert.equal(mail.isLocalMockEnabled(undefined, 'http://127.0.0.1:54321'), false);
assert.equal(mail.isLocalMockEnabled('mock', 'http://127.0.0.1:54321'), true);

const calls = [];
let allowed = true,
  result = null;
const handler = createEmailHandler({
  configured: true,
  crypto: c,
  clientIp: () => '127.0.0.7',
  authenticate: async (token) => {
    if (token !== 'valid') throw new core.ActionError(401, 'AUTH_REQUIRED');
    return { id: 'owner', email: 'registered@example.test' };
  },
  rpc: async (name, args) => {
    calls.push({ name, args });
    return name === 'deletion_email_budget' ? allowed : result;
  },
});
const post = (body, auth, extra = {}) =>
  handler(
    new Request('http://local.test/account-actions/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
        ...extra,
      },
      body: JSON.stringify(body),
    }),
  );
assert.equal((await post({ action: 'request_deletion_email', channel: 'app' })).status, 401);
assert.equal(
  (await post({ action: 'request_deletion_email', channel: 'app' }, 'invalid')).status,
  401,
);
assert.equal(
  (
    await post(
      { action: 'request_deletion_email', channel: 'app', email: 'other@example.test' },
      'valid',
    )
  ).status,
  400,
);
const requested = await post({ action: 'request_deletion_email', channel: 'app' }, 'valid', {
  'X-Forwarded-For': 'attacker',
});
assert.equal(requested.status, 202);
const app = await requested.json();
assert.equal(
  calls.find((call) => call.name === 'enqueue_deletion_email').args.p_email,
  'registered@example.test',
);
assert.equal(
  calls.find((call) => call.name === 'deletion_email_budget').args.p_ip_hash,
  await c.tag('ip', '127.0.0.7'),
);
const appKeys = Object.keys(app).sort();
for (const email of ['registered@example.test', 'absent@example.test']) {
  const response = await post({ action: 'request_deletion_email', channel: 'web', email });
  assert.equal(response.status, 202);
  assert.deepEqual(Object.keys(await response.json()).sort(), appKeys);
}
allowed = false;
const before = calls.filter((call) => call.name === 'enqueue_deletion_email').length;
const limited = await post({
  action: 'request_deletion_email',
  channel: 'web',
  email: 'absent@example.test',
});
assert.equal(limited.status, 202);
assert.deepEqual(Object.keys(await limited.json()).sort(), appKeys);
assert.equal(calls.filter((call) => call.name === 'enqueue_deletion_email').length, before);
allowed = true;
assert.equal(
  (
    await post(
      { action: 'request_deletion_email', channel: 'web', email: 'fixture@example.test' },
      'invalid',
    )
  ).status,
  400,
  'no JWT fallback on web route',
);
assert.equal(
  (
    await post({
      action: 'verify_deletion_email',
      channel: 'web',
      requestId: app.requestId,
      flowToken: app.flowToken,
      code: 'wrong',
    })
  ).status,
  400,
);
assert.ok(
  calls.some((call) => call.name === 'verify_deletion_email_code'),
  'malformed code consumes DB attempt path',
);
const proofId = crypto.randomUUID();
result = {
  proofId,
  operationId: proofId,
  intentId: crypto.randomUUID(),
  expiresAt: new Date(Date.now() + 300000).toISOString(),
};
const verified = await post({
  action: 'verify_deletion_email',
  channel: 'web',
  requestId: app.requestId,
  flowToken: app.flowToken,
  code: '01234567',
});
assert.equal(verified.status, 200);
const proof = await verified.json();
assert.match(proof.proofToken, /^[0-9a-f]{64}$/);
const confirm = {
  action: 'confirm_deletion',
  channel: 'web',
  proofId,
  flowToken: app.flowToken,
  proofToken: proof.proofToken,
  receipt: c.token(),
  consent: true,
};
assert.equal((await post({ ...confirm, consent: false })).status, 400);
assert.equal(
  (await post({ ...confirm, receipt: proof.proofToken })).status,
  400,
  'receipt is not an approval token',
);
assert.equal((await post({ ...confirm, userId: 'other' })).status, 400);
result = { state: 'GRACE' };
assert.equal((await post(confirm)).status, 200);
const confirmCall = calls.findLast((call) => call.name === 'confirm_deletion_email');
assert.equal(confirmCall.args.p_user_id, null, 'web user derived by DB from proof');
assert.equal(confirmCall.args.p_consent, true);
result = null;
assert.equal((await post(confirm)).status, 409, 'consumed proof rejected');
const disabled = createEmailHandler({ configured: false });
assert.equal((await disabled(new Request('http://local.test', { method: 'POST' }))).status, 503);
const failure = createEmailHandler({
  configured: true,
  crypto: c,
  clientIp: () => 'local',
  rpc: async () => {
    throw Error('sensitive provider detail');
  },
});
const sanitized = await failure(
  new Request('http://local.test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'request_deletion_email',
      channel: 'web',
      email: 'fixture@example.test',
    }),
  }),
);
assert.deepEqual(await sanitized.json(), { code: 'EMAIL_ACTION_UNAVAILABLE' });
console.log(
  'PASS email API/crypto: 8 digits, HMAC purpose/request binding, encrypted outbox/AAD, local-only mock, app email authority, web uniform response, proxy spoof resistance, explicit consent and receipt separation',
);

for (const outcome of ['SENT', 'RETRY', 'UNKNOWN', 'FAILED']) {
  const sender = new mail.MockDeletionEmailSender();
  let used = false,
    finished;
  const dispatch = mail.createEmailDispatcher({
    claim: async () => {
      if (used) return null;
      used = true;
      return { requestId: id, leaseToken: 'lease', ciphertext: cipher };
    },
    open: c.open,
    sender:
      outcome === 'SENT'
        ? sender
        : {
            send: async () => {
              throw new mail.EmailDeliveryError(outcome);
            },
          },
    finish: async (lease, value) => {
      assert.equal(lease.leaseToken, 'lease');
      finished = value;
    },
  });
  assert.deepEqual(await dispatch(), { attempted: 1 });
  assert.equal(finished, outcome);
  assert.equal(sender.messages.size, outcome === 'SENT' ? 1 : 0);
}
const runtime = readFileSync('supabase/functions/account-actions/index.ts', 'utf8');
assert.ok(!runtime.includes('confirmDeletion:'), 'old confirmation adapter is disconnected');
for (const file of [
  'email.ts',
  'email-crypto.ts',
  'email-mailer.ts',
  'email-resend.ts',
  'email-provider.ts',
]) {
  const source = readFileSync(`supabase/functions/account-actions/${file}`, 'utf8');
  assert.ok(!/console\.|signInWithOtp|verifyOtp|setSession/.test(source));
}
console.log(
  'PASS email delivery: mock inbox, safe failure retry, ambiguous failure quarantine, no login OTP/session replacement, no sensitive logging and legacy confirm disconnected',
);
