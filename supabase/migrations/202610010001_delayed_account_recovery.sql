begin;

-- Delayed account recovery replaces identity re-proof for sensitive actions.
--
-- Why: Google never emits auth_time (it is absent from its OpenID claims_supported, and
-- neither max_age nor the claims request parameter is supported), so the previous freshness
-- check could not succeed for any token. More fundamentally, parent and child share one
-- Supabase identity on one device, so every re-authentication the parent can perform the
-- child can perform too. The only asymmetries available are elapsed time the child cannot
-- hide and cancellation by whoever knows the current PIN.

alter table public.sensitive_action_challenges
  alter column google_sub drop not null,
  alter column nonce drop not null,
  add column available_at timestamptz;

-- Rows created under the Google-proof contract can never be acted on again.
update public.sensitive_action_challenges
  set status = 'cancelled' where status in ('pending', 'verified');
update public.sensitive_action_challenges
  set available_at = created_at where available_at is null;

alter table public.sensitive_action_challenges
  alter column available_at set not null,
  add constraint sensitive_action_available_at_check check (available_at >= created_at);

-- One waiting request per purpose: re-requesting must not create a second, later window.
create unique index sensitive_action_one_pending_per_purpose
  on public.sensitive_action_challenges(user_id, purpose) where status = 'pending';

create function public.sensitive_action_delay(p_purpose text)
returns interval language sql immutable set search_path = '' as $$
  select case p_purpose
    when 'delete_account' then interval '14 days'
    when 'reset_parent_pin' then interval '72 hours'
  end;
$$;

drop function public.verify_sensitive_action(uuid, uuid, timestamptz);
drop function public.begin_sensitive_action(uuid, text, text, text);

create function public.request_sensitive_action(p_user_id uuid, p_purpose text)
returns public.sensitive_action_challenges
language plpgsql security definer set search_path = '' as $$
declare result public.sensitive_action_challenges; delay interval; started timestamptz;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 0));
  delay := public.sensitive_action_delay(p_purpose);
  if delay is null then
    raise exception 'Invalid purpose' using errcode = '22023';
  end if;

  -- Returning the existing record keeps the window fixed: a repeat request can neither
  -- shorten it nor push it further out, so neither party gains by pressing again.
  select * into result from public.sensitive_action_challenges
    where user_id = p_user_id and purpose = p_purpose and status = 'pending'
      and expires_at > pg_catalog.clock_timestamp();
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
    and expires_at < pg_catalog.clock_timestamp() - interval '1 day';

  started := pg_catalog.clock_timestamp();
  insert into public.sensitive_action_challenges(user_id, purpose, available_at, expires_at)
    values (p_user_id, p_purpose, started + delay, started + delay + interval '7 days')
    returning * into result;
  return result;
end;
$$;

create function public.cancel_pending_sensitive_action(p_user_id uuid, p_purpose text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  update public.sensitive_action_challenges set status = 'cancelled'
    where user_id = p_user_id and purpose = p_purpose and status = 'pending';
  return found;
end;
$$;

-- Elapsed time is the authorization; there is no separate verified state any more.
create or replace function public.consume_sensitive_action(p_user_id uuid, p_id uuid, p_purpose text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  update public.sensitive_action_challenges set status = 'consumed'
    where id = p_id and user_id = p_user_id and purpose = p_purpose and status = 'pending'
    and available_at <= pg_catalog.clock_timestamp()
    and expires_at > pg_catalog.clock_timestamp();
  return found;
end;
$$;

create or replace function public.prepare_account_deletion(p_user_id uuid, p_challenge_id uuid, p_receipt_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare proof public.sensitive_action_challenges; operation public.account_deletion_operations;
begin
  -- Lock Auth before challenge/operation, consistently with the Auth deletion trigger.
  perform 1 from auth.users where id=p_user_id for key share;
  if not found then raise exception 'Waiting period required'; end if;
  select * into proof from public.sensitive_action_challenges
    where id=p_challenge_id and user_id=p_user_id and purpose='delete_account'
      and status='pending' and available_at<=pg_catalog.clock_timestamp()
      and expires_at>pg_catalog.clock_timestamp() for update;
  if not found then raise exception 'Waiting period required'; end if;
  insert into public.account_deletion_operations(user_id,challenge_id,receipt_hash,execute_before)
    values(p_user_id,p_challenge_id,p_receipt_hash,proof.expires_at) returning * into operation;
  return pg_catalog.jsonb_build_object('operationId',operation.id,'expiresAt',operation.expires_at);
end;
$$;

-- Display-only projection for the in-app countdown banner. No identifier is exposed, so
-- acting on a request still goes through the Edge Function.
create function public.list_pending_sensitive_actions()
returns table(purpose text, available_at timestamptz, expires_at timestamptz)
language sql security definer stable set search_path = '' as $$
  select challenge.purpose, challenge.available_at, challenge.expires_at
  from public.sensitive_action_challenges as challenge
  where challenge.user_id = (select auth.uid())
    and challenge.status = 'pending'
    and challenge.expires_at > pg_catalog.clock_timestamp();
$$;

-- verify_parent_pin now cancels a waiting reset while holding the credential row, so this
-- path must take the same lock order (credential, then request) to avoid a deadlock between
-- a PIN check and a PIN reset running at the same time.
create or replace function public.reset_parent_pin_with_proof(p_user_id uuid, p_id uuid, p_new_pin text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if p_new_pin is null or p_new_pin operator(pg_catalog.!~) '^[0-9]{4}$' then
    raise exception 'Invalid PIN format' using errcode = '22023';
  end if;
  perform 1
  from public.parent_pin_credentials as credentials
  join public.profiles as profile on profile.id = credentials.parent_id
  where profile.auth_user_id = p_user_id
  for update of credentials;
  if not found then
    raise exception 'Credential missing' using errcode = 'P0001';
  end if;
  if not public.consume_sensitive_action(p_user_id, p_id, 'reset_parent_pin') then
    return false;
  end if;
  update public.parent_pin_credentials as credentials
    set pin_hash = extensions.crypt(p_new_pin, extensions.gen_salt('bf', 12)),
      failed_attempts = 0, locked_until = null, updated_at = pg_catalog.clock_timestamp()
    from public.profiles as profile
    where profile.id = credentials.parent_id and profile.auth_user_id = p_user_id;
  if not found then
    -- Roll back proof consumption too; never report success without a credential update.
    raise exception 'Credential missing' using errcode = 'P0001';
  end if;
  return true;
end;
$$;

-- Entering the current PIN proves the parent is present, so it clears a waiting reset.
-- This is the asymmetry the delay relies on: the child cannot produce the PIN.
create or replace function public.verify_parent_pin(parent_pin text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_auth_user_id uuid := (select auth.uid());
  credential public.parent_pin_credentials%rowtype;
  checked_at timestamptz;
  next_attempts smallint;
begin
  if current_auth_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select credentials.* into credential
  from public.parent_pin_credentials as credentials
  join public.profiles as profile
    on profile.id operator(pg_catalog.=) credentials.parent_id
  where profile.auth_user_id operator(pg_catalog.=) current_auth_user_id
  for update of credentials;

  if not found then
    return false;
  end if;
  checked_at := pg_catalog.clock_timestamp();
  if credential.locked_until operator(pg_catalog.>) checked_at then
    return null;
  end if;

  if parent_pin is not null and parent_pin operator(pg_catalog.~) '^[0-9]{4}$' then
    if credential.pin_hash operator(pg_catalog.=)
       extensions.crypt(parent_pin, credential.pin_hash) then
      update public.parent_pin_credentials
      set failed_attempts = 0, locked_until = null, updated_at = checked_at
      where parent_id operator(pg_catalog.=) credential.parent_id;
      perform public.cancel_pending_sensitive_action(current_auth_user_id, 'reset_parent_pin');
      return true;
    end if;
  end if;

  next_attempts := case when credential.locked_until is not null then 1
    else credential.failed_attempts operator(pg_catalog.+) 1 end;
  update public.parent_pin_credentials
  set failed_attempts = next_attempts,
      locked_until = case when next_attempts operator(pg_catalog.>=) 5
        then checked_at operator(pg_catalog.+) interval '5 minutes' else null end,
      updated_at = checked_at
  where parent_id operator(pg_catalog.=) credential.parent_id;

  if next_attempts operator(pg_catalog.>=) 5 then
    return null;
  end if;
  return false;
end;
$$;

revoke all on function public.sensitive_action_delay(text),
  public.request_sensitive_action(uuid,text),
  public.cancel_pending_sensitive_action(uuid,text),
  public.reset_parent_pin_with_proof(uuid,uuid,text),
  public.consume_sensitive_action(uuid,uuid,text),
  public.prepare_account_deletion(uuid,uuid,text),
  public.list_pending_sensitive_actions() from public, anon, authenticated;
grant execute on function public.reset_parent_pin_with_proof(uuid,uuid,text),
  public.consume_sensitive_action(uuid,uuid,text),
  public.prepare_account_deletion(uuid,uuid,text) to service_role;
revoke all on function public.verify_parent_pin(text) from public, anon, authenticated, service_role;
grant execute on function public.request_sensitive_action(uuid,text),
  public.cancel_pending_sensitive_action(uuid,text) to service_role;
grant execute on function public.list_pending_sensitive_actions() to authenticated;
grant execute on function public.verify_parent_pin(text) to authenticated;

commit;
