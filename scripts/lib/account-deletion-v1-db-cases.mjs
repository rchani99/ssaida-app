import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';

export async function runDeletionV1Cases({
  sql,
  storageFixture,
  concurrentSql,
  holdTransaction,
  localFetch,
  base,
  adminHeaders,
  password,
  setStage,
}) {
  // postgres image does not start Storage migrations. This metadata-only fixture models
  // the observed zero-bucket deployment; no Storage API behavior is mocked as deletion.
  storageFixture(`create schema if not exists storage;
    create table storage.buckets(id text primary key,name text not null);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),owner uuid,owner_id text,name text);
    grant all on storage.buckets,storage.objects to postgres;`);
  const hash = () => createHash('sha256').update(randomBytes(32)).digest('hex');
  const fails = (body, label) => assert.throws(() => sql(body), undefined, label);
  const legacyUser = randomUUID();
  sql(`insert into auth.users(id) values('${legacyUser}');`);
  const legacyId = sql(
    `select (public.request_sensitive_action('${legacyUser}','delete_account')).id;`,
  );
  const legacyHash = hash();
  const legacyReceipt = JSON.parse(
    sql(`select public.watch_account_deletion('${legacyUser}','${legacyId}','${legacyHash}');`),
  );
  for (const file of readdirSync('supabase/migrations')
    .filter((name) => name.endsWith('.sql') && name >= '202610180002' && name < '202610190001')
    .sort()) {
    setStage(file);
    sql(readFileSync(`supabase/migrations/${file}`, 'utf8'));
  }
  setStage('v1 legacy backfill and compatibility');
  assert.equal(
    sql(
      `select policy_version||':'||state from public.account_deletion_requests where user_id='${legacyUser}';`,
    ),
    'legacy-delay-v0:GRACE',
  );
  assert.equal(
    sql(
      `select count(*) from public.account_deletion_operations where id='${legacyReceipt.operationId}' and request_id is not null;`,
    ),
    '1',
  );
  sql(
    `update public.account_deletion_requests set grace_ends_at=clock_timestamp()-interval '1 second' where user_id='${legacyUser}';`,
  );
  const legacyLease = JSON.parse(sql(`select public.claim_account_deletion('${legacyUser}');`));
  assert.equal(
    sql(
      `select public.get_account_deletion_status('${legacyReceipt.operationId}','${legacyHash}');`,
    ),
    'pending',
  );
  fails(`delete from auth.users where id='${legacyUser}';`, 'Auth cannot bypass cleanup');
  sql(
    `select public.prepare_account_deletion_cleanup('${legacyLease.requestId}','${legacyLease.leaseToken}');`,
  );
  await holdTransaction(`delete from auth.users where id='${legacyUser}'`, async () => {
    assert.equal(
      sql(
        `select public.get_account_deletion_status('${legacyReceipt.operationId}','${legacyHash}');`,
      ),
      'pending',
    );
  });
  sql(`delete from auth.users where id='${legacyUser}';`);
  assert.equal(
    sql(
      `select public.get_account_deletion_status('${legacyReceipt.operationId}','${legacyHash}');`,
    ),
    'deleted',
  );
  console.log(
    'PASS v1 upgrade: policy backfill, existing receipt, cleanup prerequisite, transaction rollback and Auth-independent completion',
  );

  const user = randomUUID();
  const other = randomUUID();
  sql(
    `insert into auth.users(id,email,email_confirmed_at) values('${user}','${user}@example.test',clock_timestamp()),('${other}','${other}@example.test',clock_timestamp());`,
  );
  const tokenHash = hash();
  setStage('v1 email authorization and duplicate confirmation');
  fails(
    `select public.request_sensitive_action('${user}','delete_account');`,
    'legacy begin must fail closed',
  );
  assert.equal(sql('select public.claim_due_account_deletion() is null;'), 't');
  const proof = sql(
    `select public.register_account_deletion_email_proof('${user}','${user}@example.test','${tokenHash}');`,
  );
  fails(
    `select public.confirm_account_deletion('${other}','${proof}','${tokenHash}');`,
    'cross-account proof',
  );
  fails(
    `select public.confirm_account_deletion('${user}','${proof}','${hash()}');`,
    'wrong proof token',
  );
  fails(
    `begin; set local role authenticated; select public.confirm_account_deletion('${user}','${proof}','${tokenHash}'); commit;`,
    'service-only confirmation',
  );
  const confirmations = await Promise.all(
    [1, 2].map(() =>
      concurrentSql(`select public.confirm_account_deletion('${user}','${proof}','${tokenHash}');`),
    ),
  );
  const confirmed = JSON.parse(confirmations[0]);
  assert.deepEqual(JSON.parse(confirmations[1]), confirmed);
  assert.equal(
    sql(`select count(*) from public.account_deletion_requests where user_id='${user}';`),
    '1',
  );
  assert.equal(
    sql(
      `select grace_ends_at-confirmed_at=interval '14 days' from public.account_deletion_requests where id='${confirmed.requestId}';`,
    ),
    't',
  );
  assert.equal(sql(`select public.account_access_allowed('${user}');`), 't');
  sql(
    `begin; set local role authenticated; set local "request.jwt.claim.sub"='${user}'; select public.complete_parent_onboarding('Grace child',60,'1234'); commit;`,
  );
  assert.equal(sql(`select public.claim_account_deletion('${user}') is null;`), 't');
  assert.equal(sql(`select public.cancel_sensitive_action('${user}','${confirmed.id}');`), 't');
  assert.equal(
    JSON.parse(sql(`select public.confirm_account_deletion('${user}','${proof}','${tokenHash}');`))
      .state,
    'CANCELLED',
    'used proof cannot recreate cancelled request',
  );
  assert.equal(
    sql(
      `select user_id is null and challenge_id is null from public.account_deletion_requests where id='${confirmed.requestId}';`,
    ),
    't',
  );
  console.log(
    'PASS v1 email boundary: service-only proof, account binding, wrong token, concurrent confirmation, fixed grace, grace access, cancellation and no capability replay',
  );

  setStage('v1 email change and expiry');
  const otherHash = hash();
  const otherProof = sql(
    `select public.register_account_deletion_email_proof('${other}','${other}@example.test','${otherHash}');`,
  );
  sql(`update auth.users set email='changed@example.test' where id='${other}';`);
  fails(
    `select public.confirm_account_deletion('${other}','${otherProof}','${otherHash}');`,
    'changed registered email',
  );
  sql(
    `update auth.users set email='${other}@example.test' where id='${other}'; update public.account_deletion_email_proofs set expires_at=clock_timestamp()-interval '1 second' where id='${otherProof}';`,
  );
  fails(
    `select public.confirm_account_deletion('${other}','${otherProof}','${otherHash}');`,
    'expired email proof',
  );

  // Create a real Auth session and use its subject for PostgreSQL authenticated-role checks.
  setStage('v1 real Auth session and old JWT fence');
  const email = `v1-${randomUUID()}@example.test`;
  const created = await localFetch(`${base}/admin/users`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  assert.equal(created.status, 200);
  const account = await created.json();
  const login = await localFetch(`${base}/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(login.status, 200);
  const session = await login.json();
  const subject = JSON.parse(Buffer.from(session.access_token.split('.')[1], 'base64url')).sub;
  assert.equal(subject, account.id);
  sql(
    `begin; set local role authenticated; set local "request.jwt.claim.sub"='${subject}'; select public.complete_parent_onboarding('Worker child',60,'1234'); commit;`,
  );
  const registeredHash = hash();
  const proofId = sql(
    `select public.register_account_deletion_email_proof('${subject}','${email}','${registeredHash}');`,
  );
  const r = JSON.parse(
    sql(`select public.confirm_account_deletion('${subject}','${proofId}','${registeredHash}');`),
  );
  const receiptHash = hash();
  const receipt = JSON.parse(
    sql(`select public.watch_account_deletion('${subject}','${r.id}','${receiptHash}');`),
  );
  const checkStatus = () =>
    sql(`select public.get_account_deletion_status('${receipt.operationId}','${receiptHash}');`);
  assert.equal(checkStatus(), 'pending');
  const childId = sql(
    `select c.id from public.children c join public.profiles p on p.id=c.parent_id where p.auth_user_id='${subject}';`,
  );
  sql(`begin; set local role authenticated; set local "request.jwt.claim.sub"='${subject}';
    select public.create_study_item('${childId}',
      '{"item_type":"ACTIVITY","name":"Isolated learning","estimated_minutes":15,"study_weekdays":[1,2,3,4,5,6,7]}'::jsonb,true); commit;`);
  assert.equal(sql(`select count(*) from public.study_items where child_id='${childId}';`), '1');
  assert.equal(sql(`select count(*)>0 from public.daily_plans where child_id='${childId}';`), 't');
  sql(
    `update public.account_deletion_requests set grace_ends_at=clock_timestamp()-interval '1 second' where id='${r.requestId}';`,
  );
  await holdTransaction(
    `set local role authenticated; set local "request.jwt.claim.sub"='${subject}'; select public.verify_parent_pin('1234')`,
    async () => {
      assert.equal(
        sql(`select public.claim_account_deletion('${subject}') is null;`),
        't',
        'claim waits for in-flight user mutation',
      );
    },
    true,
  );
  // v1 cancellation is strictly before deadline, regardless of scheduler delay.
  const [cancelled, claim1, claim2] = await Promise.all([
    concurrentSql(`select public.cancel_sensitive_action('${subject}','${r.id}');`).catch(
      () => 'f',
    ),
    concurrentSql(`select public.claim_account_deletion('${subject}');`),
    concurrentSql(`select public.claim_account_deletion('${subject}');`),
  ]);
  assert.equal(cancelled, 'f');
  assert.equal([claim1, claim2].filter(Boolean).length, 1, 'single lease winner');
  const lease = JSON.parse(claim1 || claim2);
  assert.equal(sql(`select public.account_access_allowed('${subject}');`), 'f');
  // Auth token is still valid here; access must be fenced in Postgres independently.
  assert.equal(
    (
      await localFetch(`${base}/user`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
    ).status,
    200,
  );
  const rows = sql(
    `begin; set local role authenticated; set local "request.jwt.claim.sub"='${subject}'; select 'rows='||count(*) from public.profiles; commit;`,
  );
  assert.match(rows, /rows=0/);
  fails(
    `begin; set local role authenticated; set local "request.jwt.claim.sub"='${subject}'; select public.complete_parent_onboarding('Blocked',60,'1111'); commit;`,
    'onboarding bypass',
  );
  fails(
    `begin; set local role authenticated; set local "request.jwt.claim.sub"='${subject}'; select public.verify_parent_pin('1234'); commit;`,
    'PIN bypass',
  );
  fails(
    `begin; set local role authenticated; set local "request.jwt.claim.sub"='${subject}'; select public.ensure_daily_plan('${childId}',current_date); commit;`,
    'learning definer bypass',
  );
  fails(
    `begin; set local role authenticated; set local "request.jwt.claim.sub"='${subject}'; update public.children set name='Blocked' where id='${childId}'; commit;`,
    'direct mutation bypass',
  );
  fails(
    `select public.reset_parent_pin_with_proof('${subject}','${randomUUID()}','1111');`,
    'service PIN bypass',
  );
  assert.equal(
    sql(`select public.start_account_deletion('${subject}','${r.id}','${receipt.operationId}');`),
    'f',
    'old direct Auth path closed',
  );
  fails(
    `select public.prepare_account_deletion_cleanup('${lease.requestId}','${randomUUID()}');`,
    'wrong lease',
  );
  console.log(
    'PASS v1 claim: deadline/cancellation race, duplicate workers, still-valid old JWT blocked by RLS, onboarding/PIN/learning/direct-write guards',
  );

  setStage('v1 Storage boundary and crash recovery');
  sql(`insert into storage.buckets(id,name) values('isolated-v1','isolated-v1');`);
  fails(
    `select public.prepare_account_deletion_cleanup('${lease.requestId}','${lease.leaseToken}');`,
    'Storage extension must fail closed',
  );
  assert.equal(
    sql(`select count(*) from public.profiles where auth_user_id='${subject}';`),
    '1',
    'Storage checked before data cleanup',
  );
  sql(`delete from storage.buckets where id='isolated-v1';`);
  const premature = await localFetch(`${base}/admin/users/${subject}`, {
    method: 'DELETE',
    headers: adminHeaders,
    body: JSON.stringify({ should_soft_delete: false }),
  });
  assert.notEqual(premature.status, 200, 'Auth cleanup trigger guards real Admin API');
  sql(
    `select public.prepare_account_deletion_cleanup('${lease.requestId}','${lease.leaseToken}');`,
  );
  sql(
    `select public.prepare_account_deletion_cleanup('${lease.requestId}','${lease.leaseToken}');`,
  );
  assert.equal(sql(`select count(*) from public.profiles where auth_user_id='${subject}';`), '0');
  assert.equal(sql(`select count(*) from public.study_items where child_id='${childId}';`), '0');
  assert.equal(sql(`select count(*) from public.daily_plans where child_id='${childId}';`), '0');
  assert.equal(checkStatus(), 'pending');
  sql(
    `select public.fail_account_deletion('${lease.requestId}','${lease.leaseToken}','AUTH_DELETE_FAILED');`,
  );
  assert.equal(
    sql(`select public.claim_account_deletion('${subject}') is null;`),
    't',
    'retry backoff',
  );
  sql(
    `update public.account_deletion_requests set next_attempt_at=clock_timestamp()-interval '1 second' where id='${lease.requestId}';`,
  );
  const retry = JSON.parse(sql(`select public.claim_account_deletion('${subject}');`));
  assert.notEqual(retry.leaseToken, lease.leaseToken);
  fails(
    `select public.prepare_account_deletion_cleanup('${lease.requestId}','${lease.leaseToken}');`,
    'stale worker fenced',
  );
  sql(
    `select public.fail_account_deletion('${lease.requestId}','${lease.leaseToken}','CLEANUP_FAILED');`,
  );
  assert.equal(
    sql(
      `select lease_token='${retry.leaseToken}' from public.account_deletion_requests where id='${lease.requestId}';`,
    ),
    't',
  );
  sql(
    `select public.prepare_account_deletion_cleanup('${retry.requestId}','${retry.leaseToken}');`,
  );
  const deleted = await localFetch(`${base}/admin/users/${subject}`, {
    method: 'DELETE',
    headers: adminHeaders,
    body: JSON.stringify({ should_soft_delete: false }),
  });
  assert.equal(deleted.status, 200, JSON.stringify(await deleted.json()));
  assert.equal(checkStatus(), 'deleted');
  assert.equal(
    sql(
      `select state||':'||(user_id is null)::text||':'||(challenge_id is null)::text from public.account_deletion_requests where id='${retry.requestId}';`,
    ),
    'DELETED:true:true',
  );
  assert.equal(sql(`select public.account_deletion_completed('${retry.requestId}');`), 't');
  assert.equal(sql(`select public.claim_account_deletion('${subject}') is null;`), 't');
  assert.equal(
    sql(`select public.account_access_allowed('${subject}');`),
    'f',
    'Auth absence protects old JWT after identifiers erased',
  );
  console.log(
    'PASS v1 cleanup/retry: fail-closed Storage, real Admin rejection before cleanup, idempotent cleanup, fenced retry/backoff, real Auth deletion, receipt recovery and PII removal',
  );

  setStage('v1 comprehensive privileges and definer inventory');
  assert.equal(
    sql(`select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prosecdef and has_function_privilege('authenticated',p.oid,'execute')
    and p.prorettype<>'trigger'::regtype and p.prorettype<>'event_trigger'::regtype
    and p.proname not in ('account_access_allowed','list_pending_sensitive_actions')
    and p.prosrc not like '%perform public.assert_account_access(auth.uid());%';`),
    '0',
    'all executable definers guarded',
  );
  assert.equal(
    sql(`select count(*) from information_schema.role_table_grants where table_schema='public'
    and table_name in ('account_deletion_requests','account_deletion_email_proofs')
    and grantee in ('anon','authenticated','service_role');`),
    '0',
  );
  // PIN request still starts a 72-hour delay for an active account.
  sql(
    `update public.sensitive_action_challenges set created_at=created_at-interval '1 minute' where user_id='${user}';`,
  );
  assert.equal(
    sql(
      `select (public.request_sensitive_action('${user}','reset_parent_pin')).available_at > clock_timestamp()+interval '71 hours';`,
    ),
    't',
  );
  console.log(
    'PASS v1 privileges: private ledger/proofs, complete authenticated definer inventory and unchanged 72-hour PIN recovery',
  );
}
