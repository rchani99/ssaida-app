import assert from 'node:assert/strict';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';

export async function runDeletionEmailCases({ sql, concurrentSql, setStage }) {
  for (const file of readdirSync('supabase/migrations')
    .filter((name) => name.endsWith('.sql') && name >= '202610190001')
    .sort()) {
    setStage(file);
    sql(readFileSync(`supabase/migrations/${file}`, 'utf8'));
  }
  setStage('email code normal/app/web confirmation');
  const secret = randomBytes(32);
  const tag = (value) => createHmac('sha256', secret).update(value).digest('hex');
  const flow = tag('flow'),
    code = tag('code'),
    approval = tag('approval'),
    receipt = tag('receipt');
  const owner = () => {
    const id = randomUUID();
    sql(
      `insert into auth.users(id,email,email_confirmed_at) values('${id}','${id}@example.test',clock_timestamp());`,
    );
    return id;
  };
  const enqueue = (user, channel = 'web', id = randomUUID(), email = `${user}@example.test`) => {
    sql(
      `select public.enqueue_deletion_email('${id}','${channel}',${channel === 'app' ? `'${user}'` : 'null'},'${email}','${tag(email)}','${flow}','${code}','encrypted-fixture');`,
    );
    return id;
  };
  const sent = (id) =>
    sql(`update public.account_deletion_email_challenges set delivery='SENT' where id='${id}';`);
  const verifySQL = (id, channel = 'web', user = null, hash = code, flowHash = flow) =>
    `select public.verify_deletion_email_code('${id}','${channel}',${user ? `'${user}'` : 'null'},'${flowHash}','${hash}','${tag(id + approval)}');`;
  const verify = (...args) => sql(verifySQL(...args));
  const confirmSQL = (proof, id, channel = 'web', user = null, consent = true) =>
    `select public.confirm_deletion_email('${proof}','${channel}',${user ? `'${user}'` : 'null'},'${flow}','${tag(id + approval)}','${receipt}',${consent});`;
  const appUser = owner(),
    other = owner(),
    app = enqueue(appUser, 'app');
  sent(app);
  assert.equal(verify(app, 'app', other), '', 'JWT target mismatch');
  assert.equal(verify(app, 'web'), '', 'app code cannot switch channels');
  const appProof = JSON.parse(verify(app, 'app', appUser));
  assert.equal(verify(app, 'app', appUser), '', 'single-use code');
  assert.equal(
    sql(confirmSQL(appProof.proofId, app, 'web')),
    '',
    'app proof cannot become web approval',
  );
  assert.equal(
    sql(confirmSQL(appProof.proofId, app, 'app', other)),
    '',
    'wrong app JWT at confirmation',
  );
  assert.equal(
    sql(confirmSQL(appProof.proofId, app, 'app', appUser, false)),
    '',
    'explicit consent required',
  );
  const appRequest = JSON.parse(sql(confirmSQL(appProof.proofId, app, 'app', appUser)));
  assert.equal(appRequest.state, 'GRACE');
  assert.equal(sql(confirmSQL(appProof.proofId, app, 'app', appUser)), '', 'single-use approval');
  assert.equal(
    sql(`select public.get_account_deletion_status('${appProof.proofId}','${receipt}');`),
    'pending',
    'receipt survives lost confirm response',
  );
  const webUser = owner(),
    web = enqueue(webUser);
  sent(web);
  const webProof = JSON.parse(verify(web));
  const webRequest = JSON.parse(sql(confirmSQL(webProof.proofId, web)));
  assert.equal(
    webRequest.requestId,
    webProof.intentId,
    'approval bound to reserved deletion intent',
  );
  assert.equal(
    sql(
      `select grace_ends_at-confirmed_at=interval '14 days' from public.account_deletion_requests where id='${webRequest.requestId}';`,
    ),
    't',
  );
  assert.equal(
    sql(`select count(*) from auth.sessions where user_id in ('${webUser}','${appUser}');`),
    '0',
    'email verification creates no login sessions',
  );
  assert.equal(sql(`select public.account_access_allowed('${webUser}');`), 't');
  assert.equal(sql(`select public.cancel_sensitive_action('${webUser}','${webRequest.id}');`), 't');
  assert.equal(
    sql(`select public.get_account_deletion_status('${webProof.proofId}','${receipt}');`),
    'failed',
    'read-only receipt contract',
  );
  console.log(
    'PASS email DB: app JWT binding, web confirmation without JWT, explicit consent, reserved intent, 14-day grace, one-use approval, independent receipt and no login session',
  );

  setStage('email expiry/attempts/concurrency/email changes');
  const expired = enqueue(owner());
  sent(expired);
  sql(
    `update public.account_deletion_email_challenges set expires_at=clock_timestamp()-interval '1 second' where id='${expired}';`,
  );
  assert.equal(verify(expired), '');
  const blocked = enqueue(owner());
  sent(blocked);
  for (let i = 0; i < 5; i++) assert.equal(verify(blocked, 'web', null, tag(`wrong${i}`)), '');
  assert.equal(verify(blocked), '', 'correct code after five failures is rejected');
  assert.equal(
    sql(`select failures from public.account_deletion_email_challenges where id='${blocked}';`),
    '5',
  );
  const race = enqueue(owner());
  sent(race);
  const results = await Promise.all([
    concurrentSql(verifySQL(race)),
    concurrentSql(verifySQL(race)),
  ]);
  assert.equal(results.filter(Boolean).length, 1, 'atomic code consumption');
  const changedUser = owner(),
    changed = enqueue(changedUser);
  sent(changed);
  sql(`update auth.users set email='changed-${changedUser}@example.test' where id='${changedUser}';
    update auth.users set email='${changedUser}@example.test' where id='${changedUser}';`);
  assert.equal(verify(changed), '', 'changing email away and back invalidates old code');
  const proofUser = owner(),
    proofCode = enqueue(proofUser);
  sent(proofCode);
  const changedProof = JSON.parse(verify(proofCode));
  sql(`update auth.users set email='changed-${proofUser}@example.test' where id='${proofUser}';`);
  assert.equal(
    sql(confirmSQL(changedProof.proofId, proofCode)),
    '',
    'email change invalidates issued proof',
  );
  const proofExpire = enqueue(owner());
  sent(proofExpire);
  const expiredProof = JSON.parse(verify(proofExpire));
  sql(
    `update public.account_deletion_email_proofs set expires_at=clock_timestamp()-interval '1 second' where id='${expiredProof.proofId}';`,
  );
  assert.equal(sql(confirmSQL(expiredProof.proofId, proofExpire)), '');
  const unknown = enqueue(null, 'web', randomUUID(), 'absent@example.test');
  assert.equal(verify(unknown), '');
  assert.equal(
    sql(
      `select user_id is null and delivery='VOID' and ciphertext is null from public.account_deletion_email_challenges where id='${unknown}';`,
    ),
    't',
  );
  console.log(
    'PASS email DB: expiry, five-attempt lockout, code replay/concurrent verification, changed email (including change-back), proof expiry and absent email',
  );

  setStage('email resend/concurrent requests/rate limits');
  const resendUser = owner(),
    first = enqueue(resendUser),
    second = enqueue(resendUser);
  assert.equal(
    sql(`select count(*) from public.account_deletion_email_challenges where id='${second}';`),
    '0',
    '60-second cooldown',
  );
  sent(first);
  const resendProof = JSON.parse(verify(first));
  sql(
    `update public.account_deletion_email_challenges set created_at=created_at-interval '61 seconds' where id='${first}';`,
  );
  const fresh = enqueue(resendUser);
  sent(fresh);
  assert.equal(sql(confirmSQL(resendProof.proofId, first)), '', 'resend revokes older proof');
  assert.ok(verify(fresh));
  const concurrentUser = owner();
  const queue = (id) =>
    `select public.enqueue_deletion_email('${id}','web',null,'${concurrentUser}@example.test','${tag(`${concurrentUser}@example.test`)}','${flow}','${code}','encrypted-fixture');`;
  await Promise.all([concurrentSql(queue(randomUUID())), concurrentSql(queue(randomUUID()))]);
  assert.equal(
    sql(
      `select count(*) from public.account_deletion_email_challenges where user_id='${concurrentUser}';`,
    ),
    '1',
  );
  sql('truncate public.account_deletion_email_limits;');
  for (let i = 0; i < 5; i++)
    assert.equal(
      sql(`select public.deletion_email_budget('request','${tag('ip')}','${tag('email')}');`),
      't',
    );
  assert.equal(
    sql(`select public.deletion_email_budget('request','${tag('newip')}','${tag('email')}');`),
    'f',
    'per-email limit independent of IP',
  );
  sql('truncate public.account_deletion_email_limits;');
  sql(
    `select public.deletion_email_budget('request','${tag('ip')}',md5(n::text)||md5(n::text)) from generate_series(1,20)n;`,
  );
  assert.equal(
    sql(`select public.deletion_email_budget('request','${tag('ip')}','${tag('newemail')}');`),
    'f',
    'IP limit independent of email',
  );
  sql('truncate public.account_deletion_email_limits;');
  sql(
    `select public.deletion_email_budget('request',md5(n::text)||md5(n::text),md5(n::text)||md5(n::text)) from generate_series(1,100)n;`,
  );
  assert.equal(
    sql(`select public.deletion_email_budget('request','${tag('newip')}','${tag('newemail')}');`),
    'f',
    'global limit',
  );
  console.log(
    'PASS email DB: cooldown, resend invalidation, concurrent request serialization and atomic IP/email/global budgets',
  );

  setStage('email outbox retries/unknown delivery/permissions');
  sql(`update public.account_deletion_email_challenges set delivery='VOID';`);
  const delivery = enqueue(owner());
  const claims = await Promise.all([
    concurrentSql('select public.claim_deletion_email_delivery();'),
    concurrentSql('select public.claim_deletion_email_delivery();'),
  ]);
  assert.equal(claims.filter(Boolean).length, 1);
  let lease = JSON.parse(claims.find(Boolean));
  assert.equal(lease.requestId, delivery);
  for (let n = 0; n < 3; n++) {
    sql(
      `select public.finish_deletion_email_delivery('${delivery}','${lease.leaseToken}','RETRY');`,
    );
    sql(
      `update public.account_deletion_email_challenges set next_send_at=clock_timestamp()-interval '1 second' where id='${delivery}';`,
    );
    const next = sql('select public.claim_deletion_email_delivery();');
    if (n < 2) {
      assert.ok(next);
      lease = JSON.parse(next);
    } else assert.equal(next, '');
  }
  assert.equal(
    sql(`select delivery from public.account_deletion_email_challenges where id='${delivery}';`),
    'FAILED',
  );
  const abandoned = enqueue(owner());
  const abandonedLease = JSON.parse(sql('select public.claim_deletion_email_delivery();'));
  sql(
    `update public.account_deletion_email_challenges set lease_until=clock_timestamp()-interval '1 second' where id='${abandoned}';`,
  );
  sql(
    `select public.finish_deletion_email_delivery('${abandoned}','${abandonedLease.leaseToken}','SENT');`,
  );
  assert.equal(
    sql(`select delivery from public.account_deletion_email_challenges where id='${abandoned}';`),
    'SENDING',
    'expired lease cannot record success',
  );
  assert.equal(
    sql('select public.claim_deletion_email_delivery();'),
    '',
    'uncertain delivery is not sent twice',
  );
  sql(
    `select public.finish_deletion_email_delivery('${abandoned}','${abandonedLease.leaseToken}','SENT');`,
  );
  assert.equal(
    sql(`select delivery from public.account_deletion_email_challenges where id='${abandoned}';`),
    'UNKNOWN',
    'stale mail worker fenced',
  );
  // Stage 3: provider backoff must preserve the original code/expiry and must not
  // refund application request budgets or bypass the user's resend cooldown.
  const retryOwner = owner(),
    retryId = enqueue(retryOwner);
  const retryLease = JSON.parse(sql('select public.claim_deletion_email_delivery();'));
  const original = sql(
    `select code_hmac||'|'||expires_at::text from public.account_deletion_email_challenges where id='${retryId}';`,
  );
  const budgets = sql('select coalesce(sum(hits),0) from public.account_deletion_email_limits;');
  sql(
    `select public.finish_deletion_email_delivery('${retryId}','${retryLease.leaseToken}','RETRY',90);`,
  );
  assert.equal(
    sql(
      `select delivery='RETRY' and ciphertext is not null and next_send_at>clock_timestamp()+interval '85 seconds' from public.account_deletion_email_challenges where id='${retryId}';`,
    ),
    't',
  );
  assert.equal(
    sql('select public.claim_deletion_email_delivery();'),
    '',
    'Retry-After is enforced in DB',
  );
  assert.equal(
    sql(
      `select code_hmac||'|'||expires_at::text from public.account_deletion_email_challenges where id='${retryId}';`,
    ),
    original,
  );
  assert.equal(
    sql('select coalesce(sum(hits),0) from public.account_deletion_email_limits;'),
    budgets,
  );
  const tooSoon = enqueue(retryOwner);
  assert.equal(
    sql(`select count(*) from public.account_deletion_email_challenges where id='${tooSoon}';`),
    '0',
    'provider failure does not remove resend cooldown',
  );
  sql(
    `update public.account_deletion_email_challenges set created_at=created_at-interval '61 seconds',next_send_at=clock_timestamp()-interval '1 second' where id='${retryId}';`,
  );
  const oldLease = JSON.parse(sql('select public.claim_deletion_email_delivery();'));
  const replaced = enqueue(retryOwner);
  sql(
    `select public.finish_deletion_email_delivery('${retryId}','${oldLease.leaseToken}','SENT',15);`,
  );
  assert.equal(verify(retryId), '', 'late provider success cannot resurrect a replaced code');
  assert.equal(
    sql(
      `select invalidated_at is not null and ciphertext is null from public.account_deletion_email_challenges where id='${retryId}';`,
    ),
    't',
  );
  const replacementLease = JSON.parse(sql('select public.claim_deletion_email_delivery();'));
  assert.equal(replacementLease.requestId, replaced);
  sql(
    `select public.finish_deletion_email_delivery('${replaced}','${replacementLease.leaseToken}','SENT',15);`,
  );
  assert.ok(verify(replaced));
  assert.equal(verify(replaced), '', 'delivered replacement is still single-use');
  for (const [outcome, delay, nearExpiry] of [
    ['FAILED', 15, false],
    ['RETRY', 601, false],
    ['RETRY', 90, true],
  ]) {
    const failId = enqueue(owner());
    const failLease = JSON.parse(sql('select public.claim_deletion_email_delivery();'));
    if (nearExpiry)
      sql(
        `update public.account_deletion_email_challenges set expires_at=clock_timestamp()+interval '30 seconds' where id='${failId}';`,
      );
    sql(
      `select public.finish_deletion_email_delivery('${failId}','${failLease.leaseToken}','${outcome}',${delay});`,
    );
    assert.equal(
      sql(
        `select delivery='FAILED' and ciphertext is null and lease_token is null from public.account_deletion_email_challenges where id='${failId}';`,
      ),
      't',
      'terminal provider error or backoff past expiry discards mail',
    );
    assert.equal(verify(failId), '');
    assert.equal(sql('select public.claim_deletion_email_delivery();'), '');
  }
  assert.throws(() =>
    sql(
      `begin;set local role authenticated;select public.finish_deletion_email_delivery('${retryId}','${retryLease.leaseToken}','SENT',15);commit;`,
    ),
  );
  assert.equal(
    sql(
      "select has_function_privilege('service_role','public.finish_deletion_email_delivery(uuid,uuid,text,integer)','EXECUTE');",
    ),
    't',
  );
  console.log(
    'PASS Resend DB: Retry-After, unchanged code/expiry/budgets, resend cooldown/replacement during send, terminal failures, expiry cutoff and service-only completion',
  );
  assert.throws(() =>
    sql(
      `select public.register_account_deletion_email_proof('${other}','${other}@example.test','${approval}');`,
    ),
  );
  assert.throws(() =>
    sql(
      `select public.confirm_account_deletion('${appUser}','${appProof.proofId}','${approval}');`,
    ),
  );
  assert.throws(() =>
    sql(
      `begin;set local role authenticated;select public.verify_deletion_email_code('${app}','app','${appUser}','${flow}','${code}','${approval}');commit;`,
    ),
  );
  assert.equal(
    sql(
      `select count(*) from information_schema.role_table_grants where table_name in ('account_deletion_email_challenges','account_deletion_email_limits') and grantee in ('anon','authenticated','service_role');`,
    ),
    '0',
  );
  const pinUser = owner();
  assert.equal(
    sql(
      `select (public.request_sensitive_action('${pinUser}','reset_parent_pin')).available_at>clock_timestamp()+interval '71 hours';`,
    ),
    't',
  );
  sql(`select public.cleanup_sensitive_action_challenges();`);
  console.log(
    'PASS email DB: one mail lease, bounded safe retries, ambiguous delivery blocked, stale worker fenced, private RPC/tables, old issuer/confirmation bypass closed and PIN 72-hour policy',
  );
}
