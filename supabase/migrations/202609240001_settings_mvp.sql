begin;

-- Text contract: changed, invalid, locked, same.
-- Invalid attempts must not raise because the lockout update must commit.
create function public.change_parent_pin(current_pin text, new_pin text)
returns text
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
  if new_pin is null or new_pin operator(pg_catalog.!~) '^[0-9]{4}$' then
    raise exception 'New PIN must contain exactly four digits' using errcode = '22023';
  end if;

  select credentials.* into credential
  from public.parent_pin_credentials as credentials
  join public.profiles as profile
    on profile.id operator(pg_catalog.=) credentials.parent_id
  where profile.auth_user_id operator(pg_catalog.=) current_auth_user_id
  for update of credentials;

  if not found then
    raise exception 'Credential not found' using errcode = '42501';
  end if;
  checked_at := pg_catalog.clock_timestamp();
  if credential.locked_until operator(pg_catalog.>) checked_at then
    return 'locked';
  end if;

  if current_pin is null or current_pin operator(pg_catalog.!~) '^[0-9]{4}$'
     or credential.pin_hash operator(pg_catalog.<>) extensions.crypt(current_pin, credential.pin_hash) then
    next_attempts := case when credential.locked_until is not null then 1
      else credential.failed_attempts operator(pg_catalog.+) 1 end;
    update public.parent_pin_credentials
    set failed_attempts = next_attempts,
        locked_until = case when next_attempts operator(pg_catalog.>=) 5
          then checked_at operator(pg_catalog.+) interval '5 minutes' else null end,
        updated_at = checked_at
    where parent_id operator(pg_catalog.=) credential.parent_id;
    if next_attempts operator(pg_catalog.>=) 5 then return 'locked'; end if;
    return 'invalid';
  end if;

  if credential.pin_hash operator(pg_catalog.=) extensions.crypt(new_pin, credential.pin_hash) then
    update public.parent_pin_credentials
    set failed_attempts = 0, locked_until = null, updated_at = checked_at
    where parent_id operator(pg_catalog.=) credential.parent_id;
    return 'same';
  end if;

  update public.parent_pin_credentials
  set pin_hash = extensions.crypt(new_pin, extensions.gen_salt('bf', 12)),
      failed_attempts = 0,
      locked_until = null,
      updated_at = checked_at
  where parent_id operator(pg_catalog.=) credential.parent_id;
  return 'changed';
end;
$$;

revoke all on function public.change_parent_pin(text, text)
from public, anon, authenticated, service_role;
grant execute on function public.change_parent_pin(text, text) to authenticated;

commit;
