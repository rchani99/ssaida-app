import assert from 'node:assert/strict';

import { createClient } from '@supabase/supabase-js';

const url = process.env.STEP3_API_URL;
const key = process.env.STEP3_ANON_KEY;
const serviceKey = process.env.STEP3_SERVICE_ROLE_KEY;
if (!url || !key || !serviceKey || !['localhost', '127.0.0.1'].includes(new URL(url).hostname)) {
  throw new Error('Local Supabase test environment is required');
}
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, serviceKey, options);
const users = [];
async function checked(request) {
  const result = await request;
  assert.equal(result.error, null, result.error?.message);
  return result.data;
}
async function user(pin) {
  const email = `step41-${crypto.randomUUID()}@example.test`;
  const password = crypto.randomUUID();
  const created = await checked(
    admin.auth.admin.createUser({ email, password, email_confirm: true }),
  );
  users.push(created.user.id);
  const client = createClient(url, key, options);
  await checked(client.auth.signInWithPassword({ email, password }));
  await checked(
    client.rpc('complete_parent_onboarding', {
      child_name: 'PIN 검증',
      target_minutes: 60,
      parent_pin: pin,
    }),
  );
  return client;
}
try {
  const a = await user('1234');
  const b = await user('5678');
  for (const value of [null, '', '123', '12345', 'abcd', '１２３４', '9999', '5678']) {
    assert.equal(await checked(a.rpc('verify_parent_pin', { parent_pin: value })), false);
  }
  assert.equal(await checked(a.rpc('verify_parent_pin', { parent_pin: '1234' })), true);
  assert.equal(await checked(b.rpc('verify_parent_pin', { parent_pin: '1234' })), false);
  assert.equal(await checked(b.rpc('verify_parent_pin', { parent_pin: '5678' })), true);
  const anonymous = createClient(url, key, options);
  assert.ok((await anonymous.rpc('verify_parent_pin', { parent_pin: '1234' })).error);
  assert.ok((await a.from('parent_pin_credentials').select('*')).error);
  assert.ok((await a.rpc('verify_parent_pin', { parent_pin: '1234', parent_id: users[1] })).error);
  console.log(
    'PASS verify_parent_pin: valid, invalid, malformed, own credentials, anon denial, no credential SELECT, no ownership parameter',
  );
} finally {
  for (const id of users) await checked(admin.auth.admin.deleteUser(id));
}
