begin;

create table public.account_deletion_email_challenges (
  id uuid primary key,
  user_id uuid references auth.users(id) on delete cascade,
  intent_id uuid not null,
  channel text not null check(channel in ('app','web')),
  purpose text not null default 'delete_account' check(purpose='delete_account'),
  version text not null default 'email-code-v1' check(version='email-code-v1'),
  email_hash text not null check(email_hash ~ '^[0-9a-f]{64}$'),
  flow_hash text not null check(flow_hash ~ '^[0-9a-f]{64}$'),
  code_hmac text check(code_hmac ~ '^[0-9a-f]{64}$'),
  ciphertext text,
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null default clock_timestamp()+interval '10 minutes',
  failures integer not null default 0 check(failures between 0 and 5),
  consumed_at timestamptz,
  invalidated_at timestamptz,
  delivery text not null default 'PENDING' check(delivery in ('PENDING','SENDING','SENT','RETRY','FAILED','UNKNOWN','VOID')),
  send_attempts integer not null default 0,
  next_send_at timestamptz not null default clock_timestamp(),
  lease_token uuid,
  lease_until timestamptz
);
create index deletion_email_recent on public.account_deletion_email_challenges(email_hash,created_at desc);
create index deletion_email_outbox on public.account_deletion_email_challenges(next_send_at) where delivery in ('PENDING','RETRY');
alter table public.account_deletion_email_challenges enable row level security;
revoke all on public.account_deletion_email_challenges from public,anon,authenticated,service_role;

create table public.account_deletion_email_limits (
  scope text not null,
  key_hash text not null,
  bucket bigint not null,
  hits integer not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key(scope,key_hash,bucket)
);
alter table public.account_deletion_email_limits enable row level security;
revoke all on public.account_deletion_email_limits from public,anon,authenticated,service_role;

-- Clear unconsumed stage-1 capabilities: only a successful code verification may mint
-- new proofs. Already confirmed deletion requests and receipts are unaffected.
delete from public.account_deletion_email_proofs;
alter table public.account_deletion_email_proofs
  add column email_challenge_id uuid references public.account_deletion_email_challenges(id) on delete cascade,
  add column intent_id uuid,
  add column channel text check(channel in ('app','web')),
  add column flow_hash text,
  add column purpose text not null default 'delete_account' check(purpose='delete_account'),
  add column version text not null default 'email-code-v1' check(version='email-code-v1');

create function public.deletion_email_budget(p_action text,p_ip_hash text,p_email_hash text default null)
returns boolean language plpgsql security definer set search_path='' as $$
declare span integer; global_max integer; ip_max integer; b bigint; n integer; accepted boolean := true;
begin
  if p_ip_hash is null or p_ip_hash !~ '^[0-9a-f]{64}$' then return false; end if;
  case p_action
    when 'request' then span:=3600; global_max:=100; ip_max:=20;
    when 'verify' then span:=600; global_max:=1000; ip_max:=60;
    when 'confirm' then span:=600; global_max:=300; ip_max:=30;
    else return false;
  end case;
  b:=floor(extract(epoch from clock_timestamp())/span)::bigint;
  insert into public.account_deletion_email_limits values(p_action||':global','global',b,1,clock_timestamp())
    on conflict(scope,key_hash,bucket) do update set hits=least(public.account_deletion_email_limits.hits+1,1000000) returning hits into n;
  accepted:=n<=global_max;
  insert into public.account_deletion_email_limits values(p_action||':ip',p_ip_hash,b,1,clock_timestamp())
    on conflict(scope,key_hash,bucket) do update set hits=least(public.account_deletion_email_limits.hits+1,1000000) returning hits into n;
  accepted:=accepted and n<=ip_max;
  if p_action='request' then
    if p_email_hash is null or p_email_hash !~ '^[0-9a-f]{64}$' then return false; end if;
    insert into public.account_deletion_email_limits values('request:email',p_email_hash,b,1,clock_timestamp())
      on conflict(scope,key_hash,bucket) do update set hits=least(public.account_deletion_email_limits.hits+1,1000000) returning hits into n;
    accepted:=accepted and n<=5;
  end if;
  return accepted;
end;
$$;

create function public.enqueue_deletion_email(p_id uuid,p_channel text,p_user_id uuid,p_email text,
  p_email_hash text,p_flow_hash text,p_code_hmac text,p_ciphertext text)
returns void language plpgsql security definer set search_path='' as $$
declare owner_id uuid; intent uuid; matches integer;
begin
  if p_channel not in ('app','web') or (p_channel='app' and p_user_id is null)
    or (p_channel='web' and p_user_id is not null) then raise exception 'Invalid channel'; end if;
  -- Lock email then Auth, consistently across sends. Unknown accounts follow the same
  -- cooldown and dummy-record path and never produce a different public response.
  perform pg_advisory_xact_lock(hashtextextended(p_email_hash,19));
  if exists(select 1 from public.account_deletion_email_challenges where email_hash=p_email_hash
    and created_at>clock_timestamp()-interval '60 seconds') then return; end if;
  select count(*),(array_agg(id))[1] into matches,owner_id from auth.users
    where lower(email)=p_email and email_confirmed_at is not null
    and (p_channel='web' or id=p_user_id);
  if matches<>1 then owner_id:=null; end if;
  if owner_id is not null then
    perform 1 from auth.users where id=owner_id and lower(email)=p_email and email_confirmed_at is not null for share;
    if not found or not public.account_access_allowed(owner_id) then owner_id:=null; end if;
  end if;
  select id into intent from public.account_deletion_requests where user_id=owner_id and state='GRACE';
  intent:=coalesce(intent,gen_random_uuid());
  update public.account_deletion_email_challenges set invalidated_at=clock_timestamp(),code_hmac=null,ciphertext=null,
    delivery='VOID',lease_token=null,lease_until=null where email_hash=p_email_hash and invalidated_at is null;
  delete from public.account_deletion_email_proofs where email_challenge_id in
    (select id from public.account_deletion_email_challenges where email_hash=p_email_hash);
  insert into public.account_deletion_email_challenges(id,user_id,intent_id,channel,email_hash,flow_hash,code_hmac,ciphertext,delivery)
    values(p_id,owner_id,intent,p_channel,p_email_hash,p_flow_hash,
      case when owner_id is not null then p_code_hmac end,
      case when owner_id is not null then p_ciphertext end,case when owner_id is null then 'VOID' else 'PENDING' end);
end;
$$;

create function public.invalidate_deletion_email() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if old.email is distinct from new.email or old.email_confirmed_at is distinct from new.email_confirmed_at then
    update public.account_deletion_email_challenges set invalidated_at=clock_timestamp(),code_hmac=null,ciphertext=null,
      delivery='VOID',lease_token=null,lease_until=null where user_id=new.id and invalidated_at is null;
    delete from public.account_deletion_email_proofs where user_id=new.id;
  end if;
  return new;
end;
$$;
create trigger invalidate_deletion_email after update of email,email_confirmed_at on auth.users
  for each row execute function public.invalidate_deletion_email();

create function public.verify_deletion_email_code(p_id uuid,p_channel text,p_user_id uuid,p_flow_hash text,p_code_hmac text,p_token_hash text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.account_deletion_email_challenges; owner_id uuid; proof public.account_deletion_email_proofs;
begin
  select user_id into owner_id from public.account_deletion_email_challenges where id=p_id;
  if owner_id is not null then
    perform pg_advisory_xact_lock(hashtextextended(owner_id::text,0));
    perform 1 from auth.users where id=owner_id for share;
    if not found then return null; end if;
  end if;
  select * into c from public.account_deletion_email_challenges where id=p_id for update;
  if not found or c.channel is distinct from p_channel or c.flow_hash is distinct from p_flow_hash
    or (c.channel='app' and c.user_id is distinct from p_user_id) or (c.channel='web' and p_user_id is not null)
    or c.expires_at<=clock_timestamp() or c.invalidated_at is not null or c.consumed_at is not null or c.failures>=5 then return null; end if;
  if c.user_id is null or c.delivery<>'SENT' or c.code_hmac is distinct from p_code_hmac then
    update public.account_deletion_email_challenges set failures=failures+1,
      code_hmac=case when failures>=4 then null else code_hmac end,
      ciphertext=case when failures>=4 then null else ciphertext end where id=c.id;
    return null;
  end if;
  if not public.account_access_allowed(c.user_id) then return null; end if;
  insert into public.account_deletion_email_proofs(user_id,token_hash,email_challenge_id,intent_id,channel,flow_hash,expires_at)
    values(c.user_id,p_token_hash,c.id,c.intent_id,c.channel,c.flow_hash,clock_timestamp()+interval '5 minutes') returning * into proof;
  update public.account_deletion_email_challenges set consumed_at=clock_timestamp(),code_hmac=null,ciphertext=null where id=c.id;
  return jsonb_build_object('proofId',proof.id,'operationId',proof.id,'intentId',c.intent_id,'expiresAt',proof.expires_at);
end;
$$;

create function public.confirm_deletion_email(p_proof_id uuid,p_channel text,p_user_id uuid,p_flow_hash text,
  p_token_hash text,p_receipt_hash text,p_consent boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare owner_id uuid; proof public.account_deletion_email_proofs; c public.account_deletion_email_challenges;
  r public.account_deletion_requests; challenge uuid; confirmed timestamptz; expiry timestamptz;
begin
  if p_consent is distinct from true or p_receipt_hash is null or p_receipt_hash !~ '^[0-9a-f]{64}$'
    or p_receipt_hash=p_token_hash or p_receipt_hash=p_flow_hash then return null; end if;
  select user_id into owner_id from public.account_deletion_email_proofs where id=p_proof_id;
  if owner_id is null then return null; end if;
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text,0));
  perform 1 from auth.users where id=owner_id for share;
  if not found or not public.account_access_allowed(owner_id) then return null; end if;
  select * into proof from public.account_deletion_email_proofs where id=p_proof_id for update;
  if not found or proof.channel is distinct from p_channel or proof.flow_hash is distinct from p_flow_hash
    or proof.token_hash is distinct from p_token_hash or proof.consumed_at is not null or proof.expires_at<=clock_timestamp()
    or proof.email_challenge_id is null or proof.intent_id is null
    or (proof.channel='app' and proof.user_id is distinct from p_user_id) or (proof.channel='web' and p_user_id is not null) then return null; end if;
  select * into c from public.account_deletion_email_challenges where id=proof.email_challenge_id;
  if not found or c.invalidated_at is not null or c.consumed_at is null then return null; end if;
  select * into r from public.account_deletion_requests where user_id=owner_id and state in ('GRACE','PROCESSING');
  if found then
    if r.id<>proof.intent_id or r.state<>'GRACE' then return null; end if;
  else
    if exists(select 1 from public.account_deletion_requests where id=proof.intent_id) then return null; end if;
    confirmed:=clock_timestamp();
    insert into public.sensitive_action_challenges(user_id,purpose,available_at,expires_at)
      values(owner_id,'delete_account',confirmed+interval '14 days',confirmed+interval '21 days') returning id into challenge;
    insert into public.account_deletion_requests(id,user_id,challenge_id,policy_version,state,confirmed_at,grace_ends_at)
      values(proof.intent_id,owner_id,challenge,'email-grace-v1','GRACE',confirmed,confirmed+interval '14 days') returning * into r;
  end if;
  -- Client knows operationId (=proofId) and generates its separate read-only receipt
  -- BEFORE confirmation, so a lost response is recoverable without reusing approval.
  expiry:=greatest(r.grace_ends_at+interval '7 days',clock_timestamp())+interval '30 days';
  insert into public.account_deletion_operations(id,user_id,challenge_id,request_id,receipt_hash,execute_before,expires_at)
    values(proof.id,owner_id,r.challenge_id,r.id,p_receipt_hash,r.grace_ends_at+interval '7 days',expiry);
  update public.account_deletion_email_proofs set consumed_at=clock_timestamp(),request_id=r.id where id=proof.id;
  return jsonb_build_object('requestId',r.id,'id',r.challenge_id,'state',r.state,'policyVersion',r.policy_version,
    'availableAt',r.grace_ends_at,'operationId',proof.id,'receiptExpiresAt',expiry);
end;
$$;

-- No old endpoint or trusted-but-unverified issuer can bypass code consumption/consent.
create or replace function public.register_account_deletion_email_proof(p_user_id uuid,p_verified_email text,p_token_hash text)
returns uuid language plpgsql security definer set search_path='' as $$ begin raise exception 'Email code verification required'; end; $$;
create or replace function public.confirm_account_deletion(p_user_id uuid,p_proof_id uuid,p_token_hash text)
returns jsonb language plpgsql security definer set search_path='' as $$ begin raise exception 'Explicit email confirmation required'; end; $$;

create function public.claim_deletion_email_delivery()
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.account_deletion_email_challenges; lease uuid;
begin
  -- An abandoned send may have reached the provider. Never automatically send it twice.
  update public.account_deletion_email_challenges set delivery='UNKNOWN',ciphertext=null,lease_token=null,lease_until=null
    where delivery='SENDING' and lease_until<=clock_timestamp();
  select * into c from public.account_deletion_email_challenges where delivery in ('PENDING','RETRY')
    and user_id is not null and invalidated_at is null and failures<5 and expires_at>clock_timestamp()
    and next_send_at<=clock_timestamp() and send_attempts<3 order by next_send_at limit 1 for update skip locked;
  if not found then return null; end if;
  lease:=gen_random_uuid();
  update public.account_deletion_email_challenges set delivery='SENDING',lease_token=lease,
    lease_until=clock_timestamp()+interval '1 minute',send_attempts=send_attempts+1 where id=c.id;
  return jsonb_build_object('requestId',c.id,'leaseToken',lease,'ciphertext',c.ciphertext);
end;
$$;
create function public.finish_deletion_email_delivery(p_id uuid,p_lease_token uuid,p_outcome text)
returns void language plpgsql security definer set search_path='' as $$
begin
  if p_outcome not in ('SENT','RETRY','UNKNOWN') then raise exception 'Invalid outcome'; end if;
  update public.account_deletion_email_challenges set
    delivery=case when p_outcome='RETRY' and send_attempts>=3 then 'FAILED' else p_outcome end,
    next_send_at=clock_timestamp()+interval '15 seconds',lease_token=null,lease_until=null,
    ciphertext=case when p_outcome='RETRY' and send_attempts<3 then ciphertext else null end
  where id=p_id and lease_token=p_lease_token and lease_until>clock_timestamp()
    and delivery='SENDING' and invalidated_at is null;
end;
$$;

alter function public.cleanup_sensitive_action_challenges() rename to cleanup_sensitive_action_challenges_v1;
revoke all on function public.cleanup_sensitive_action_challenges_v1() from public,anon,authenticated,service_role;
create function public.cleanup_sensitive_action_challenges() returns integer
language plpgsql security definer set search_path='' as $$
declare removed integer;
begin
  removed:=public.cleanup_sensitive_action_challenges_v1();
  with stale as (select id from public.account_deletion_email_challenges where expires_at<clock_timestamp()-interval '10 minutes'
    order by expires_at limit 1000 for update skip locked)
    delete from public.account_deletion_email_challenges c using stale where c.id=stale.id;
  with stale as (select scope,key_hash,bucket from public.account_deletion_email_limits where created_at<clock_timestamp()-interval '2 days'
    order by created_at limit 1000 for update skip locked)
    delete from public.account_deletion_email_limits l using stale where l.scope=stale.scope and l.key_hash=stale.key_hash and l.bucket=stale.bucket;
  return removed;
end;
$$;

do $$ declare f regprocedure; begin
  for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname=any(array['deletion_email_budget','enqueue_deletion_email','verify_deletion_email_code',
      'confirm_deletion_email','claim_deletion_email_delivery','finish_deletion_email_delivery','cleanup_sensitive_action_challenges']) loop
    execute format('revoke all on function %s from public,anon,authenticated',f);
    execute format('grant execute on function %s to service_role',f);
  end loop;
end $$;
revoke all on function public.invalidate_deletion_email() from public,anon,authenticated,service_role;
commit;
