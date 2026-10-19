import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import ts from 'typescript';

function load(name, mocks = {}) {
  const module = { exports: {} };
  new Function(
    'require',
    'module',
    'exports',
    ts.transpileModule(readFileSync(`supabase/functions/account-actions/${name}.ts`, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS },
    }).outputText,
  )(
    (id) => {
      assert.ok(id in mocks, `Unexpected import ${id}`);
      return mocks[id];
    },
    module,
    module.exports,
  );
  return module.exports;
}
const mail = load('email-mailer');
const resend = load('email-resend', { './email-mailer.ts': mail });
const provider = load('email-provider', { './email-mailer.ts': mail, './email-resend.ts': resend });
const key = 're_fixture_key_not_real';
const from = '쌓이다 <security@mail.example.test>';
const message = { requestId: crypto.randomUUID(), email: 'fixture@example.test', code: '01234567' };
const config = {
  mode: 'resend',
  supabaseUrl: 'https://fixture.supabase.co',
  resendApiKey: key,
  from,
};
for (const invalid of [
  { mode: undefined },
  { mode: 'smtp' },
  { resendApiKey: '' },
  { from: '' },
  { resendApiKey: 're_bad\r\nheader' },
  { from: 'bad\r\nheader' },
  { from: 'a@example.test,b@example.test' },
  { from: 'invalid' },
  { mode: 'mock' },
])
  assert.equal(provider.createDeletionEmailSender({ ...config, ...invalid }), undefined);
assert.ok(provider.createDeletionEmailSender(config) instanceof resend.ResendDeletionEmailSender);
assert.ok(
  provider.createDeletionEmailSender({
    ...config,
    mode: 'mock',
    supabaseUrl: 'http://127.0.0.1:54321',
    resendApiKey: '',
  }) instanceof mail.MockDeletionEmailSender,
);
assert.throws(() => new resend.ResendDeletionEmailSender('', from), /Email delivery unavailable/);

const requests = [];
const sender = new resend.ResendDeletionEmailSender(key, from, async (url, init) => {
  requests.push({ url, init });
  return Response.json({ id: 'provider-id' });
});
await sender.send(message);
await sender.send(message);
assert.equal(requests.length, 2);
assert.equal(requests[0].url, 'https://api.resend.com/emails');
assert.equal(requests[0].init.redirect, 'error');
assert.equal(requests[0].init.method, 'POST');
assert.equal(requests[0].init.headers.Authorization, `Bearer ${key}`);
assert.equal(
  requests[0].init.headers['Idempotency-Key'],
  requests[1].init.headers['Idempotency-Key'],
);
assert.equal(requests[0].init.body, requests[1].init.body);
const body = JSON.parse(requests[0].init.body);
assert.deepEqual(body.to, [message.email]);
assert.equal(body.from, from);
for (const part of [body.text, body.html]) {
  assert.ok(part.includes('01234567') && part.includes('10분') && part.includes('14일'));
  assert.ok(!part.includes(message.email) && !part.includes(message.requestId));
}
assert.ok(!body.subject.includes(message.code));
assert.ok(!/https?:|<img|<script|href=/.test(body.html));
await assert.rejects(sender.send({ ...message, code: '<script>' }), /Email delivery unavailable/);
assert.equal(requests.length, 2, 'invalid code never reaches provider');
await sender.send({ ...message, requestId: crypto.randomUUID(), code: '76543210' });
assert.notEqual(
  requests[0].init.headers['Idempotency-Key'],
  requests[2].init.headers['Idempotency-Key'],
);
assert.notEqual(requests[0].init.body, requests[2].init.body, 'user resend gets new code and key');

const now = Date.parse('2026-10-19T00:00:00Z');
for (const [status, data, headers, expected, delay] of [
  [429, { name: 'rate_limit_exceeded' }, { 'Retry-After': '90' }, 'RETRY', 90],
  [429, {}, { 'Retry-After': 'Mon, 19 Oct 2026 00:02:00 GMT' }, 'RETRY', 120],
  [429, {}, { 'Retry-After': '999999999' }, 'RETRY', 601],
  [429, {}, { 'Retry-After': '9'.repeat(400) }, 'RETRY', 601],
  [429, {}, { 'Retry-After': 'invalid' }, 'RETRY', 15],
  [429, { name: 'daily_quota_exceeded' }, {}, 'FAILED', 15],
  [429, { name: 'monthly_quota_exceeded' }, {}, 'FAILED', 15],
  [500, {}, {}, 'RETRY', 15],
  [503, {}, { 'Retry-After': '30' }, 'RETRY', 30],
  [409, { name: 'concurrent_idempotent_requests' }, {}, 'RETRY', 15],
  [409, { name: 'invalid_idempotent_request' }, {}, 'FAILED', 15],
  [400, {}, {}, 'FAILED', 15],
  [401, {}, {}, 'FAILED', 15],
  [403, {}, {}, 'FAILED', 15],
  [422, {}, {}, 'FAILED', 15],
  [200, {}, {}, 'UNKNOWN', 15],
]) {
  const s = new resend.ResendDeletionEmailSender(
    key,
    from,
    async () => Response.json(data, { status, headers }),
    100,
    () => now,
  );
  await assert.rejects(s.send(message), (error) => {
    assert.ok(error instanceof mail.EmailDeliveryError);
    assert.equal(error.outcome, expected, `status ${status}`);
    assert.equal(error.retryAfterSeconds, delay);
    assert.equal(error.message, 'Email delivery unavailable');
    return true;
  });
}
for (const response of [new Response('invalid JSON'), new Response('x'.repeat(8192))]) {
  const s = new resend.ResendDeletionEmailSender(key, from, async () => response);
  await assert.rejects(s.send(message), (error) => error.outcome === 'UNKNOWN');
}
// Simulate provider acceptance followed by a lost response. The persisted retry
// uses the same key/body and the mock provider accepts only one logical message.
const accepted = new Map();
let loseResponse = true;
const dedupSender = new resend.ResendDeletionEmailSender(key, from, async (_, init) => {
  const id = init.headers['Idempotency-Key'];
  if (accepted.has(id)) assert.equal(accepted.get(id), init.body);
  accepted.set(id, init.body);
  if (loseResponse) {
    loseResponse = false;
    throw Error(`${key} ${message.email} ${message.code}`);
  }
  return Response.json({ id: 'already-accepted' });
});
let finished;
const dispatch = () => {
  let claimed = false;
  return mail.createEmailDispatcher({
    claim: async () => {
      if (claimed) return null;
      claimed = true;
      return { requestId: message.requestId, leaseToken: 'lease', ciphertext: 'fixture' };
    },
    open: async () => ({ email: message.email, code: message.code }),
    sender: dedupSender,
    finish: async (_, outcome, delay) => {
      finished = { outcome, delay };
    },
  })();
};
await dispatch();
assert.deepEqual(finished, { outcome: 'RETRY', delay: 15 });
await dispatch();
assert.equal(finished.outcome, 'SENT');
assert.equal(accepted.size, 1);
for (const hangingBody of [false, true]) {
  let signal;
  const s = new resend.ResendDeletionEmailSender(
    key,
    from,
    async (_, init) => {
      signal = init.signal;
      if (hangingBody)
        return new Response(new ReadableStream({ start() {} }), {
          status: 429,
          headers: { 'Retry-After': '90' },
        });
      return new Promise(() => {});
    },
    10,
  );
  await assert.rejects(
    s.send(message),
    (error) => error.outcome === 'RETRY' && error.retryAfterSeconds === (hangingBody ? 90 : 15),
  );
  assert.equal(signal.aborted, true, 'timeout covers headers and body');
}
const privateErrorSender = new resend.ResendDeletionEmailSender(key, from, async () => {
  throw Error(`${key} ${message.email} ${message.code}`);
});
await assert.rejects(privateErrorSender.send(message), (error) => {
  for (const secret of [key, message.email, message.code])
    assert.ok(!String(error.stack).includes(secret));
  assert.equal(error.outcome, 'RETRY');
  return true;
});
console.log(
  'PASS Resend: fail-closed provider configuration, Korean template, exact idempotent retries, lost response deduplication, 429/backoff/quota, 5xx, 409 conflicts, permanent failure, timeout/response bounds and redacted errors (no network calls)',
);
