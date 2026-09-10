begin;

alter table public.parent_pin_credentials
  add column failed_attempts smallint not null default 0,
  add column locked_until timestamptz,
  add constraint parent_pin_credentials_failed_attempts_check check (failed_attempts >= 0);

-- Boolean contract: true = valid, false = invalid, NULL = temporarily locked.
-- Do not raise after recording a failure: an exception would roll back the counter/lock.
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

  -- Ownership is derived solely from auth.uid(); serialize all attempts on this credential.
  select credentials.* into credential
  from public.parent_pin_credentials as credentials
  join public.profiles as profile
    on profile.id operator(pg_catalog.=) credentials.parent_id
  where profile.auth_user_id operator(pg_catalog.=) current_auth_user_id
  for update of credentials;

  if not found then
    return false;
  end if;
  -- Read the wall clock after obtaining the lock, not the transaction's start time.
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
      return true;
    end if;
  end if;

  -- Expired locks start a fresh group of attempts; malformed input also counts as failure.
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

revoke all on function public.verify_parent_pin(text) from public, anon, authenticated, service_role;
grant execute on function public.verify_parent_pin(text) to authenticated;

commit;
