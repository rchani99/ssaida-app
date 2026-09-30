begin;

-- Deliberately NO FK to auth.users or challenges: recovery survives their cascades.
-- user_id is needed only until deletion; the deletion trigger erases both identifiers.
create table public.account_deletion_operations (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  user_id uuid,
  challenge_id uuid unique,
  receipt_hash text not null check (receipt_hash ~ '^[0-9a-f]{64}$'),
  state text not null default 'PREPARED' check (state in ('PREPARED','DELETED')),
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  execute_before timestamptz not null,
  expires_at timestamptz not null default (pg_catalog.clock_timestamp() + interval '7 days'),
  started_at timestamptz,
  deleted_at timestamptz,
  check ((state = 'PREPARED' and user_id is not null and challenge_id is not null)
    or (state = 'DELETED' and user_id is null and challenge_id is null and deleted_at is not null))
);
create index account_deletion_owner on public.account_deletion_operations(user_id) where user_id is not null;
create index account_deletion_expiry on public.account_deletion_operations(expires_at);
alter table public.account_deletion_operations enable row level security;
revoke all on public.account_deletion_operations from public, anon, authenticated, service_role;

create function public.prepare_account_deletion(p_user_id uuid, p_challenge_id uuid, p_receipt_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare proof public.sensitive_action_challenges; operation public.account_deletion_operations;
begin
  -- Lock Auth before challenge/operation, consistently with the Auth deletion trigger.
  perform 1 from auth.users where id=p_user_id for key share;
  if not found then raise exception 'Reauthentication required'; end if;
  select * into proof from public.sensitive_action_challenges
    where id=p_challenge_id and user_id=p_user_id and purpose='delete_account'
      and status='verified' and expires_at>pg_catalog.clock_timestamp() for update;
  if not found then raise exception 'Reauthentication required'; end if;
  insert into public.account_deletion_operations(user_id,challenge_id,receipt_hash,execute_before)
    values(p_user_id,p_challenge_id,p_receipt_hash,proof.expires_at) returning * into operation;
  return pg_catalog.jsonb_build_object('operationId',operation.id,'expiresAt',operation.expires_at);
end;
$$;

create function public.start_account_deletion(p_user_id uuid, p_challenge_id uuid, p_operation_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare operation public.account_deletion_operations;
begin
  perform 1 from auth.users where id=p_user_id for key share;
  if not found then return false; end if;
  -- Proof first avoids a lock-order inversion with prepare_account_deletion.
  perform 1 from public.sensitive_action_challenges where id=p_challenge_id for update;
  select * into operation from public.account_deletion_operations
    where id=p_operation_id and user_id=p_user_id and challenge_id=p_challenge_id for update;
  if not found or operation.state <> 'PREPARED' or operation.started_at is not null
    or operation.execute_before <= pg_catalog.clock_timestamp()
    or operation.expires_at <= pg_catalog.clock_timestamp() then return false; end if;
  if not public.consume_sensitive_action(p_user_id,p_challenge_id,'delete_account') then return false; end if;
  update public.account_deletion_operations set started_at=pg_catalog.clock_timestamp() where id=p_operation_id;
  return true;
end;
$$;

create function public.record_auth_account_deletion()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- Same COMMIT as the Admin hard deletion: no delete-success/receipt-write crash window.
  -- Trigger failure rolls back the Auth deletion; it must never be swallowed.
  update public.account_deletion_operations
    set state='DELETED',deleted_at=pg_catalog.clock_timestamp(),user_id=null,challenge_id=null
    where user_id=old.id;
  return old;
end;
$$;
create trigger record_account_deletion_receipts after delete on auth.users
for each row execute function public.record_auth_account_deletion();

create function public.get_account_deletion_status(p_operation_id uuid,p_receipt_hash text)
returns text language plpgsql security definer set search_path = '' as $$
declare operation public.account_deletion_operations;
begin
  -- No row lock or Auth lookup. MVCC yields pending before deletion commits, deleted after.
  -- Unknown ID, wrong capability and expired capability all have the same response.
  select * into operation from public.account_deletion_operations
    where id=p_operation_id and receipt_hash=p_receipt_hash and expires_at>pg_catalog.clock_timestamp();
  if not found then return 'expired'; end if;
  if operation.state='DELETED' then return 'deleted'; end if;
  -- An unclaimed proof past its execution deadline can no longer delete via this operation.
  -- A claimed Admin request can be delayed/ambiguous, so NEVER label that case failed.
  if operation.started_at is null and operation.execute_before<=pg_catalog.clock_timestamp() then return 'failed'; end if;
  return 'pending';
end;
$$;

create function public.cleanup_account_deletion_operations()
returns integer language plpgsql security definer set search_path = '' as $$
declare removed integer;
begin
  with candidates as (
    select id from public.account_deletion_operations
    where expires_at<pg_catalog.clock_timestamp()-interval '24 hours'
    order by expires_at limit 1000 for update skip locked
  ) delete from public.account_deletion_operations as operation using candidates where operation.id=candidates.id;
  get diagnostics removed=row_count;
  return removed;
end;
$$;

revoke all on function public.record_auth_account_deletion() from public,anon,authenticated,service_role;
revoke all on function public.prepare_account_deletion(uuid,uuid,text),
  public.start_account_deletion(uuid,uuid,uuid),public.get_account_deletion_status(uuid,text),
  public.cleanup_account_deletion_operations() from public,anon,authenticated;
grant execute on function public.prepare_account_deletion(uuid,uuid,text),
  public.start_account_deletion(uuid,uuid,uuid),public.get_account_deletion_status(uuid,text),
  public.cleanup_account_deletion_operations() to service_role;
commit;
