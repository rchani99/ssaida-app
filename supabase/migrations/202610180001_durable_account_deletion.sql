begin;

-- Deletion is durable until explicit cancellation or completion. expires_at remains a
-- legacy action-window field for wire compatibility; only PIN recovery expires.
-- Do not revive requests that already lapsed under the previously published policy.
update public.sensitive_action_challenges set status='cancelled'
  where purpose='delete_account' and status='pending' and expires_at<=pg_catalog.clock_timestamp();

create or replace function public.request_sensitive_action(p_user_id uuid, p_purpose text)
returns public.sensitive_action_challenges
language plpgsql security definer set search_path = '' as $$
declare result public.sensitive_action_challenges; delay interval; started timestamptz;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 0));
  delay := public.sensitive_action_delay(p_purpose);
  if delay is null then
    raise exception 'Invalid purpose' using errcode = '22023';
  end if;

  if p_purpose = 'delete_account' and exists (select 1 from public.sensitive_action_challenges
    where user_id=p_user_id and purpose='delete_account' and status='consumed') then
    raise exception 'Deletion already processing';
  end if;

  -- Returning the existing record keeps the window fixed: a repeat request can neither
  -- shorten it nor push it further out, so neither party gains by pressing again.
  select * into result from public.sensitive_action_challenges
    where user_id = p_user_id and purpose = p_purpose and status = 'pending'
      and (p_purpose = 'delete_account' or expires_at > pg_catalog.clock_timestamp());
  if found then
    return result;
  end if;

  if exists (select 1 from public.sensitive_action_challenges
    where user_id = p_user_id
      and created_at > pg_catalog.clock_timestamp() - interval '30 seconds') then
    raise exception 'Rate limited' using errcode = 'P0001';
  end if;

  update public.sensitive_action_challenges set status = 'cancelled'
    where user_id = p_user_id and purpose = p_purpose and status = 'pending';
  delete from public.sensitive_action_challenges where user_id = p_user_id
    and expires_at < pg_catalog.clock_timestamp() - interval '1 day'
    and not (purpose='delete_account' and status in ('pending','consumed'));

  started := pg_catalog.clock_timestamp();
  insert into public.sensitive_action_challenges(user_id, purpose, available_at, expires_at)
    values (p_user_id, p_purpose, started + delay, started + delay + interval '7 days')
    returning * into result;
  return result;
end;
$$;

create or replace function public.consume_sensitive_action(p_user_id uuid, p_id uuid, p_purpose text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  update public.sensitive_action_challenges set status = 'consumed'
    where id = p_id and user_id = p_user_id and purpose = p_purpose and status = 'pending'
    and available_at <= pg_catalog.clock_timestamp()
    and (p_purpose='delete_account' or expires_at > pg_catalog.clock_timestamp());
  return found;
end;
$$;

create or replace function public.watch_account_deletion(p_user_id uuid, p_challenge_id uuid, p_receipt_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare request public.sensitive_action_challenges; operation public.account_deletion_operations;
begin
  perform 1 from auth.users where id=p_user_id for key share;
  if not found then raise exception 'Request unavailable'; end if;
  select * into request from public.sensitive_action_challenges
    where id=p_challenge_id and user_id=p_user_id and purpose='delete_account'
      and status in ('pending','consumed') for update;
  if not found then raise exception 'Request unavailable'; end if;
  if (select count(*) from public.account_deletion_operations where challenge_id=p_challenge_id and expires_at>pg_catalog.clock_timestamp()) >= 100 then
    raise exception 'Receipt limit reached';
  end if;
  insert into public.account_deletion_operations(user_id,challenge_id,receipt_hash,execute_before,expires_at)
    values(p_user_id,p_challenge_id,p_receipt_hash,greatest(request.expires_at,pg_catalog.clock_timestamp()+interval '7 days'),
      greatest(request.expires_at,pg_catalog.clock_timestamp())+interval '30 days')
    returning * into operation;
  return pg_catalog.jsonb_build_object('operationId',operation.id,'expiresAt',operation.expires_at);
end;
$$;

create or replace function public.prepare_account_deletion(p_user_id uuid, p_challenge_id uuid, p_receipt_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from auth.users where id=p_user_id for key share;
  if not found then raise exception 'Waiting period required'; end if;
  perform 1 from public.sensitive_action_challenges where id=p_challenge_id and user_id=p_user_id
    and purpose='delete_account' and status='pending' and available_at<=pg_catalog.clock_timestamp() for update;
  if not found then raise exception 'Waiting period required'; end if;
  return public.watch_account_deletion(p_user_id,p_challenge_id,p_receipt_hash);
end;
$$;

create or replace function public.claim_due_account_deletion(p_retry_after interval default interval '1 hour')
returns uuid language plpgsql security definer set search_path = '' as $$
declare candidate uuid; request_id uuid;
begin
  if p_retry_after is null or p_retry_after < interval '1 minute' then
    raise exception 'Retry interval too small' using errcode='22023';
  end if;
  select user_id into candidate from public.sensitive_action_challenges
    where purpose='delete_account' and
      ((status='pending' and available_at<=pg_catalog.clock_timestamp())
        or status='consumed')
      and (purge_claimed_at is null or purge_claimed_at<pg_catalog.clock_timestamp()-p_retry_after)
    order by purge_claimed_at nulls first, available_at limit 1;
  if candidate is null then return null; end if;
  perform 1 from auth.users where id=candidate for key share;
  if not found then return null; end if;
  select id into request_id from public.sensitive_action_challenges
    where user_id=candidate and purpose='delete_account' and
      ((status='pending' and available_at<=pg_catalog.clock_timestamp())
        or status='consumed')
      and (purge_claimed_at is null or purge_claimed_at<pg_catalog.clock_timestamp()-p_retry_after)
    order by purge_claimed_at nulls first, available_at limit 1 for update skip locked;
  if not found then return null; end if;
  update public.sensitive_action_challenges set status='consumed',purge_claimed_at=pg_catalog.clock_timestamp()
    where id=request_id;
  -- A watcher must never report failed once an Admin deletion has been authorized.
  update public.account_deletion_operations set started_at=coalesce(started_at,pg_catalog.clock_timestamp())
    where challenge_id=request_id;
  return candidate;
end;
$$;

create or replace function public.count_due_account_deletions()
returns integer language sql security definer stable set search_path = '' as $$
  select count(*)::integer from public.sensitive_action_challenges
  where purpose='delete_account' and (status='consumed' or
    (status='pending' and available_at<=pg_catalog.clock_timestamp()));
$$;

create or replace function public.cleanup_sensitive_action_challenges()
returns integer language plpgsql security definer set search_path = '' as $$
declare removed integer;
begin
  with candidates as (
    select id from public.sensitive_action_challenges
    where expires_at<pg_catalog.clock_timestamp()-interval '24 hours'
      and not (purpose='delete_account' and status in ('pending','consumed'))
    order by expires_at limit 1000 for update skip locked
  ) delete from public.sensitive_action_challenges c using candidates where c.id=candidates.id;
  get diagnostics removed=row_count;
  return removed;
end;
$$;

create or replace function public.get_account_deletion_status(p_operation_id uuid,p_receipt_hash text)
returns text language plpgsql security definer set search_path = '' as $$
declare operation public.account_deletion_operations; request public.sensitive_action_challenges;
begin
  select * into operation from public.account_deletion_operations
    where id=p_operation_id and receipt_hash=p_receipt_hash and expires_at>pg_catalog.clock_timestamp();
  if not found then return 'expired'; end if;
  if operation.state='DELETED' then return 'deleted'; end if;
  select * into request from public.sensitive_action_challenges where id=operation.challenge_id;
  if found and request.status in ('pending','consumed') then return 'pending'; end if;
  if operation.started_at is null and (not found or request.status='cancelled'
      or operation.execute_before<=pg_catalog.clock_timestamp()) then return 'failed'; end if;
  return 'pending';
end;
$$;

create or replace function public.list_pending_sensitive_actions()
returns table(purpose text, available_at timestamptz, expires_at timestamptz, processing boolean)
language sql security definer stable set search_path = '' as $$
  select c.purpose,c.available_at,c.expires_at,c.status='consumed'
  from public.sensitive_action_challenges c where c.user_id=(select auth.uid()) and
    ((c.purpose='reset_parent_pin' and c.status='pending' and c.expires_at>pg_catalog.clock_timestamp()) or
      (c.purpose='delete_account' and c.status in ('pending','consumed')));
$$;

commit;
