begin;

-- This ledger deliberately has no FK to Auth or the compatibility challenge.
create table public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  challenge_id uuid unique,
  policy_version text not null check (policy_version in ('legacy-delay-v0','email-grace-v1')),
  state text not null check (state in ('GRACE','PROCESSING','CANCELLED','DELETED')),
  confirmed_at timestamptz not null,
  grace_ends_at timestamptz not null,
  started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  lease_token uuid,
  lease_until timestamptz,
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default clock_timestamp(),
  storage_checked_at timestamptz,
  data_cleaned_at timestamptz,
  auth_ready_at timestamptz,
  last_error text check (last_error in ('STORAGE_UNSUPPORTED','CLEANUP_FAILED','AUTH_DELETE_FAILED')),
  check ((state in ('GRACE','PROCESSING') and user_id is not null and challenge_id is not null)
    or (state in ('DELETED','CANCELLED') and user_id is null and challenge_id is null)),
  check (state <> 'DELETED' or completed_at is not null)
);
create unique index account_deletion_one_active on public.account_deletion_requests(user_id)
  where state in ('GRACE','PROCESSING');
create index account_deletion_due on public.account_deletion_requests(next_attempt_at,grace_ends_at)
  where state in ('GRACE','PROCESSING');
alter table public.account_deletion_requests enable row level security;
revoke all on public.account_deletion_requests from public,anon,authenticated,service_role;

-- Pending and already claimed requests retain the policy under which they were accepted.
insert into public.account_deletion_requests(user_id,challenge_id,policy_version,state,confirmed_at,grace_ends_at,started_at)
select user_id,id,'legacy-delay-v0',case when status='consumed' then 'PROCESSING' else 'GRACE' end,
  created_at,available_at,case when status='consumed' then coalesce(purge_claimed_at,clock_timestamp()) end
from public.sensitive_action_challenges where purpose='delete_account' and status in ('pending','consumed');
alter table public.account_deletion_operations add column request_id uuid references public.account_deletion_requests(id);
update public.account_deletion_operations o set request_id=r.id
  from public.account_deletion_requests r where r.challenge_id=o.challenge_id;

-- An email verifier (not implemented/exposed in this release) may mint a ten-minute,
-- deletion-only capability AFTER verifying the registered email. Never a login OTP.
create table public.account_deletion_email_proofs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  email_binding text,
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null default (clock_timestamp()+interval '10 minutes'),
  request_id uuid references public.account_deletion_requests(id),
  consumed_at timestamptz
);
alter table public.account_deletion_email_proofs enable row level security;
revoke all on public.account_deletion_email_proofs from public,anon,authenticated,service_role;

create function public.account_access_allowed(p_user_id uuid)
returns boolean language sql security definer stable set search_path='' as $$
  select p_user_id is not null and exists(select 1 from auth.users where id=p_user_id)
    and not exists(select 1 from public.account_deletion_requests where user_id=p_user_id and state='PROCESSING');
$$;
revoke all on function public.account_access_allowed(uuid) from public,anon,authenticated;
grant execute on function public.account_access_allowed(uuid) to service_role;
create function public.account_access_allowed()
returns boolean language sql security definer stable set search_path='' as $$
  select public.account_access_allowed(auth.uid());
$$;
revoke all on function public.account_access_allowed() from public,anon;
grant execute on function public.account_access_allowed() to authenticated,service_role;

-- All user mutations and the worker acquire this same lock BEFORE any data row lock.
-- An in-flight mutation finishes before claim, or observes the committed access fence.
create function public.assert_account_access(p_user_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  if p_user_id is null then raise exception 'Account unavailable' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,0));
  if not public.account_access_allowed(p_user_id) then
    raise exception 'Account unavailable' using errcode='42501';
  end if;
end;
$$;
revoke all on function public.assert_account_access(uuid) from public,anon,authenticated;
grant execute on function public.assert_account_access(uuid) to service_role;

create function public.guard_account_write() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is not null then perform public.assert_account_access(auth.uid()); end if;
  return null;
end;
$$;
revoke all on function public.guard_account_write() from public,anon,authenticated,service_role;
do $$ declare t text; begin
  foreach t in array array['profiles','children','parent_pin_credentials','study_items','daily_plans',
    'daily_tasks','child_collectibles','collectible_growth_events','pilot_core_cycles'] loop
    execute format('create policy account_deletion_access on public.%I as restrictive for all to authenticated using ((select public.account_access_allowed())) with check ((select public.account_access_allowed()))',t);
    execute format('create trigger account_deletion_write_guard before insert or update or delete on public.%I for each statement execute function public.guard_account_write()',t);
  end loop;
end $$;

-- Preserve the tested implementations, OIDs, signatures, defaults and grants. Inject an
-- entry guard into this explicit inventory, failing migration if a body has changed shape.
-- Future CREATE OR REPLACE changes to these RPCs must retain the guard (regression checked).
do $$ declare f record; guarded text; expected integer := 0; begin
  for f in select p.oid,p.proname,p.prosrc from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname = any(array[
      'add_manual_daily_task','change_parent_pin','complete_daily_task','complete_parent_onboarding',
      'confirm_daily_tasks','create_study_item','ensure_daily_plan','exclude_daily_task',
      'preview_quantity_conflict_resolution','reorder_daily_tasks','reschedule_manual_task',
      'resolve_quantity_conflict','reveal_collectible','select_collection_theme','skip_manual_task',
      'start_daily_task','undo_daily_task_completion','update_daily_task_quantity','update_study_item',
      'verify_parent_pin','reset_parent_pin_with_proof']) loop
    guarded := regexp_replace(f.prosrc,'\mBEGIN\M', E'BEGIN\n  perform public.assert_account_access(' ||
      case when f.proname='reset_parent_pin_with_proof' then 'p_user_id' else 'auth.uid()' end || ');','i');
    if guarded=f.prosrc then raise exception 'Missing RPC guard insertion point: %',f.proname; end if;
    execute replace(pg_get_functiondef(f.oid),f.prosrc,guarded);
    expected := expected+1;
  end loop;
  if expected<>21 then raise exception 'Unexpected guarded RPC inventory: %',expected; end if;
end $$;

create function public.register_account_deletion_email_proof(p_user_id uuid,p_verified_email text,p_token_hash text)
returns uuid language plpgsql security definer set search_path='' as $$
declare registered text; result uuid;
begin
  perform public.assert_account_access(p_user_id);
  select email into registered from auth.users where id=p_user_id and email_confirmed_at is not null for share;
  if registered is null or lower(registered) is distinct from lower(p_verified_email) then
    raise exception 'Email proof unavailable';
  end if;
  if exists(select 1 from public.account_deletion_email_proofs where user_id=p_user_id
    and created_at>clock_timestamp()-interval '30 seconds') then raise exception 'Rate limited'; end if;
  delete from public.account_deletion_email_proofs where user_id=p_user_id and expires_at<=clock_timestamp();
  insert into public.account_deletion_email_proofs(user_id,token_hash,email_binding)
  values(p_user_id,p_token_hash,extensions.crypt(encode(extensions.digest(lower(registered),'sha256'),'hex'),extensions.gen_salt('bf',10)))
  returning id into result;
  return result;
end;
$$;

create function public.confirm_account_deletion(p_user_id uuid,p_proof_id uuid,p_token_hash text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare proof public.account_deletion_email_proofs; r public.account_deletion_requests;
  registered text; challenge uuid; confirmed timestamptz;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,0));
  select email into registered from auth.users where id=p_user_id and email_confirmed_at is not null for share;
  select * into proof from public.account_deletion_email_proofs where id=p_proof_id
    and user_id=p_user_id and token_hash=p_token_hash and expires_at>clock_timestamp() for update;
  if not found or registered is null then raise exception 'Email proof unavailable'; end if;
  if proof.request_id is not null then
    select * into r from public.account_deletion_requests where id=proof.request_id;
  else
    perform public.assert_account_access(p_user_id);
    if extensions.crypt(encode(extensions.digest(lower(registered),'sha256'),'hex'),proof.email_binding)
      is distinct from proof.email_binding then raise exception 'Email proof unavailable'; end if;
    select * into r from public.account_deletion_requests where user_id=p_user_id and state in ('GRACE','PROCESSING');
    if not found then
      confirmed := clock_timestamp();
      insert into public.sensitive_action_challenges(user_id,purpose,available_at,expires_at)
        values(p_user_id,'delete_account',confirmed+interval '14 days',confirmed+interval '21 days') returning id into challenge;
      insert into public.account_deletion_requests(user_id,challenge_id,policy_version,state,confirmed_at,grace_ends_at)
        values(p_user_id,challenge,'email-grace-v1','GRACE',confirmed,confirmed+interval '14 days') returning * into r;
    end if;
    update public.account_deletion_email_proofs set request_id=r.id,consumed_at=clock_timestamp(),email_binding=null where id=proof.id;
  end if;
  return jsonb_build_object('requestId',r.id,'id',r.challenge_id,'state',r.state,
    'policyVersion',r.policy_version,'availableAt',r.grace_ends_at);
end;
$$;

-- Legacy clients may resume an accepted deletion; begin can no longer create one.
create or replace function public.request_sensitive_action(p_user_id uuid,p_purpose text)
returns public.sensitive_action_challenges language plpgsql security definer set search_path='' as $$
declare result public.sensitive_action_challenges; started timestamptz;
begin
  perform public.assert_account_access(p_user_id);
  if p_purpose='delete_account' then
    select c.* into result from public.sensitive_action_challenges c join public.account_deletion_requests r on r.challenge_id=c.id
      where r.user_id=p_user_id and r.state='GRACE';
    if found then return result; end if;
    raise exception 'Email verification required';
  end if;
  if p_purpose is distinct from 'reset_parent_pin' then raise exception 'Invalid purpose'; end if;
  select * into result from public.sensitive_action_challenges where user_id=p_user_id and purpose=p_purpose
    and status='pending' and expires_at>clock_timestamp();
  if found then return result; end if;
  if exists(select 1 from public.sensitive_action_challenges where user_id=p_user_id and created_at>clock_timestamp()-interval '30 seconds') then
    raise exception 'Rate limited';
  end if;
  update public.sensitive_action_challenges set status='cancelled' where user_id=p_user_id and purpose=p_purpose and status='pending';
  started := clock_timestamp();
  insert into public.sensitive_action_challenges(user_id,purpose,available_at,expires_at)
    values(p_user_id,p_purpose,started+interval '72 hours',started+interval '72 hours'+interval '7 days') returning * into result;
  return result;
end;
$$;

create or replace function public.cancel_sensitive_action(p_user_id uuid,p_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare r public.account_deletion_requests;
begin
  perform public.assert_account_access(p_user_id);
  select * into r from public.account_deletion_requests where user_id=p_user_id and challenge_id=p_id for update;
  if found then
    if r.state<>'GRACE' or (r.policy_version='email-grace-v1' and r.grace_ends_at<=clock_timestamp()) then return false; end if;
    update public.account_deletion_requests set state='CANCELLED',cancelled_at=clock_timestamp(),user_id=null,challenge_id=null where id=r.id;
    update public.sensitive_action_challenges set status='cancelled' where id=p_id;
    return true;
  end if;
  if exists(select 1 from public.sensitive_action_challenges where id=p_id and user_id=p_user_id
    and purpose='delete_account' and status='cancelled') then return true; end if;
  update public.sensitive_action_challenges set status='cancelled' where id=p_id and user_id=p_user_id
    and status in ('pending','verified','cancelled') and purpose='reset_parent_pin';
  return found;
end;
$$;
create or replace function public.cancel_pending_sensitive_action(p_user_id uuid,p_purpose text)
returns boolean language plpgsql security definer set search_path='' as $$
declare target uuid;
begin
  perform public.assert_account_access(p_user_id);
  select id into target from public.sensitive_action_challenges where user_id=p_user_id and purpose=p_purpose and status='pending';
  if target is null then return false; end if;
  return public.cancel_sensitive_action(p_user_id,target);
end;
$$;
create or replace function public.consume_sensitive_action(p_user_id uuid,p_id uuid,p_purpose text)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  perform public.assert_account_access(p_user_id);
  -- Deletion consumption is exclusively performed by the leased worker below.
  if p_purpose is distinct from 'reset_parent_pin' then return false; end if;
  update public.sensitive_action_challenges set status='consumed' where id=p_id and user_id=p_user_id
    and purpose=p_purpose and status='pending' and available_at<=clock_timestamp() and expires_at>clock_timestamp();
  return found;
end;
$$;

-- Old direct execution/claim APIs fail closed during a mixed-version deployment.
create or replace function public.start_account_deletion(p_user_id uuid,p_challenge_id uuid,p_operation_id uuid)
returns boolean language sql security definer set search_path='' as $$ select false; $$;
create or replace function public.claim_due_account_deletion(p_retry_after interval default interval '1 hour')
returns uuid language sql security definer set search_path='' as $$ select null::uuid; $$;

create function public.validate_account_deletion_operation(p_user_id uuid,p_challenge_id uuid,p_operation_id uuid)
returns boolean language sql security definer stable set search_path='' as $$
 select exists(select 1 from public.account_deletion_operations o join public.account_deletion_requests r on r.challenge_id=o.challenge_id
   where o.id=p_operation_id and o.user_id=p_user_id and o.challenge_id=p_challenge_id and o.state='PREPARED'
   and o.expires_at>clock_timestamp() and r.user_id=p_user_id and r.state in ('GRACE','PROCESSING') and r.grace_ends_at<=clock_timestamp());
$$;

create function public.claim_account_deletion(p_user_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare candidate record; r public.account_deletion_requests; lease uuid;
begin
  for candidate in select id,user_id from public.account_deletion_requests
    where (p_user_id is null or user_id=p_user_id) and state in ('GRACE','PROCESSING') and grace_ends_at<=clock_timestamp()
      and next_attempt_at<=clock_timestamp() and (lease_until is null or lease_until<=clock_timestamp())
    order by next_attempt_at,grace_ends_at limit 100 loop
    if not pg_try_advisory_xact_lock(hashtextextended(candidate.user_id::text,0)) then continue; end if;
    perform 1 from auth.users where id=candidate.user_id for key share;
    if not found then continue; end if;
    select * into r from public.account_deletion_requests where id=candidate.id and state in ('GRACE','PROCESSING')
      and grace_ends_at<=clock_timestamp() and next_attempt_at<=clock_timestamp()
      and (lease_until is null or lease_until<=clock_timestamp()) for update skip locked;
    if not found then continue; end if;
    lease := gen_random_uuid();
    update public.account_deletion_requests set state='PROCESSING',started_at=coalesce(started_at,clock_timestamp()),
      lease_token=lease,lease_until=clock_timestamp()+interval '5 minutes',attempts=attempts+1 where id=r.id;
    update public.sensitive_action_challenges set status='consumed',purge_claimed_at=clock_timestamp() where id=r.challenge_id;
    update public.account_deletion_operations set request_id=r.id,started_at=coalesce(started_at,clock_timestamp()) where challenge_id=r.challenge_id;
    return jsonb_build_object('requestId',r.id,'userId',r.user_id,'leaseToken',lease);
  end loop;
  return null;
end;
$$;

-- v1 owns NO Storage namespace: stop if Storage is introduced. Metadata-only SQL
-- deletion is forbidden. A future implementation must enumerate and remove via Storage API.
create function public.prepare_account_deletion_cleanup(p_request_id uuid,p_lease_token uuid)
returns void language plpgsql security definer set search_path='' as $$
declare owner_id uuid; r public.account_deletion_requests;
begin
  select user_id into owner_id from public.account_deletion_requests where id=p_request_id;
  if owner_id is null then raise exception 'Lease unavailable'; end if;
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text,0));
  select * into r from public.account_deletion_requests where id=p_request_id and state='PROCESSING'
    and lease_token=p_lease_token and lease_until>clock_timestamp() for update;
  if not found then raise exception 'Lease unavailable'; end if;
  -- Lock against concurrent trusted Storage provisioning until this transaction commits.
  lock table storage.buckets,storage.objects in share mode;
  if exists(select 1 from storage.buckets) or exists(select 1 from storage.objects) then raise exception 'Storage unsupported'; end if;
  update public.account_deletion_requests set storage_checked_at=clock_timestamp() where id=r.id;
  delete from public.profiles where auth_user_id=owner_id;
  -- All private app data is beneath profiles through validated cascading FKs.
  if exists(select 1 from public.profiles where auth_user_id=owner_id) then raise exception 'Cleanup incomplete'; end if;
  delete from public.sensitive_action_challenges where user_id=owner_id and purpose='reset_parent_pin';
  delete from public.account_deletion_email_proofs where user_id=owner_id;
  update public.account_deletion_requests set data_cleaned_at=coalesce(data_cleaned_at,clock_timestamp()),
    auth_ready_at=clock_timestamp(),last_error=null where id=r.id;
end;
$$;

create function public.fail_account_deletion(p_request_id uuid,p_lease_token uuid,p_code text)
returns void language plpgsql security definer set search_path='' as $$
begin
  update public.account_deletion_requests set last_error=p_code,lease_token=null,lease_until=null,
    next_attempt_at=clock_timestamp()+interval '1 hour'
  where id=p_request_id and state='PROCESSING' and lease_token=p_lease_token;
end;
$$;
create function public.account_deletion_completed(p_request_id uuid)
returns boolean language sql security definer stable set search_path='' as $$
  select exists(select 1 from public.account_deletion_requests where id=p_request_id and state='DELETED');
$$;

-- The final Auth transaction rechecks cleanup. It never trusts an earlier network response
-- or treats an arbitrary Auth 404 as success. There is no completion/receipt write gap.
create function public.guard_auth_account_deletion() returns trigger
language plpgsql security definer set search_path='' as $$
declare r public.account_deletion_requests;
begin
  select * into r from public.account_deletion_requests where user_id=old.id and state in ('GRACE','PROCESSING') for update;
  if found then
    if r.state<>'PROCESSING' or r.auth_ready_at is null or r.data_cleaned_at is null
      or exists(select 1 from public.profiles where auth_user_id=old.id) then raise exception 'Deletion cleanup required'; end if;
    lock table storage.buckets,storage.objects in share mode;
    if exists(select 1 from storage.buckets) or exists(select 1 from storage.objects) then raise exception 'Storage unsupported'; end if;
  end if;
  return old;
end;
$$;
create trigger guard_account_deletion_cleanup before delete on auth.users for each row execute function public.guard_auth_account_deletion();
revoke all on function public.guard_auth_account_deletion() from public,anon,authenticated,service_role;
create or replace function public.record_auth_account_deletion() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  update public.account_deletion_requests set state='DELETED',completed_at=clock_timestamp(),user_id=null,challenge_id=null,
    lease_token=null,lease_until=null,last_error=null where user_id=old.id;
  update public.account_deletion_operations set state='DELETED',deleted_at=clock_timestamp(),user_id=null,challenge_id=null where user_id=old.id;
  return old;
end;
$$;

-- Link receipts created by both old and future clients without changing their capability.
create function public.link_account_deletion_receipt() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  select id into new.request_id from public.account_deletion_requests where challenge_id=new.challenge_id;
  return new;
end;
$$;
create trigger link_account_deletion_receipt before insert on public.account_deletion_operations for each row execute function public.link_account_deletion_receipt();
revoke all on function public.link_account_deletion_receipt() from public,anon,authenticated,service_role;

create or replace function public.count_due_account_deletions()
returns integer language sql security definer stable set search_path='' as $$
  select count(*)::integer from public.account_deletion_requests where state in ('GRACE','PROCESSING') and grace_ends_at<=clock_timestamp();
$$;
create or replace function public.list_pending_sensitive_actions()
returns table(purpose text, available_at timestamptz, expires_at timestamptz, processing boolean)
language sql security definer stable set search_path='' as $$
  select c.purpose,c.available_at,c.expires_at,c.status='consumed' from public.sensitive_action_challenges c
  where c.user_id=auth.uid() and public.account_access_allowed() and
    ((c.purpose='reset_parent_pin' and c.status='pending' and c.expires_at>clock_timestamp())
      or (c.purpose='delete_account' and c.status in ('pending','consumed')));
$$;

-- Existing hourly cleanup also removes short-lived email bindings. Ledger terminal rows
-- contain no account identifiers; retention duration is an explicit deployment decision.
create or replace function public.cleanup_sensitive_action_challenges()
returns integer language plpgsql security definer set search_path='' as $$
declare removed integer;
begin
  with expired as (select id from public.account_deletion_email_proofs where expires_at<=clock_timestamp()
    order by expires_at limit 1000 for update skip locked)
    delete from public.account_deletion_email_proofs p using expired where p.id=expired.id;
  with candidates as (select id from public.sensitive_action_challenges
    where expires_at<clock_timestamp()-interval '24 hours' and not (purpose='delete_account' and status in ('pending','consumed'))
    order by expires_at limit 1000 for update skip locked)
    delete from public.sensitive_action_challenges c using candidates where c.id=candidates.id;
  get diagnostics removed=row_count;
  return removed;
end;
$$;

do $$ declare f regprocedure; begin
  for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname=any(array['register_account_deletion_email_proof','confirm_account_deletion',
      'validate_account_deletion_operation','claim_account_deletion','prepare_account_deletion_cleanup',
      'fail_account_deletion','account_deletion_completed']) loop
    execute format('revoke all on function %s from public,anon,authenticated',f);
    execute format('grant execute on function %s to service_role',f);
  end loop;
end $$;
commit;
