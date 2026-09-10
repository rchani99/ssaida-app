begin;

-- UI mode gate within the parent's authenticated session; not a replacement for RLS.
create or replace function public.verify_parent_pin(parent_pin text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_auth_user_id uuid := (select auth.uid());
  stored_hash text;
begin
  if current_auth_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if parent_pin is null or parent_pin operator(pg_catalog.!~) '^[0-9]{4}$' then
    return false;
  end if;

  select credentials.pin_hash into stored_hash
  from public.parent_pin_credentials as credentials
  join public.profiles as profile
    on profile.id operator(pg_catalog.=) credentials.parent_id
  where profile.auth_user_id operator(pg_catalog.=) current_auth_user_id;

  if not found then
    return false;
  end if;
  return stored_hash operator(pg_catalog.=) extensions.crypt(parent_pin, stored_hash);
end;
$$;

revoke all on function public.verify_parent_pin(text) from public, anon, authenticated, service_role;
grant execute on function public.verify_parent_pin(text) to authenticated;

commit;
