begin;

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create table public.profiles (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

create table public.children (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  parent_id uuid not null unique references public.profiles(id) on delete cascade,
  name text not null check (pg_catalog.char_length(pg_catalog.btrim(name)) between 1 and 20),
  daily_target_minutes integer not null check (daily_target_minutes between 1 and 1440),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

-- PIN hashes are deliberately isolated from the public profile shape.
-- The client roles receive no table privileges and can only write through the RPC below.
create table public.parent_pin_credentials (
  parent_id uuid primary key references public.profiles(id) on delete cascade,
  pin_hash text not null,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

alter table public.profiles enable row level security;
alter table public.children enable row level security;
alter table public.parent_pin_credentials enable row level security;

revoke all on public.profiles from anon, authenticated;
revoke all on public.children from anon, authenticated;
revoke all on public.parent_pin_credentials from anon, authenticated;

grant select on public.profiles to authenticated;
grant select, update on public.children to authenticated;

create policy "profiles_select_own"
on public.profiles for select
to authenticated
using ((select auth.uid()) = auth_user_id);

create policy "children_select_own"
on public.children for select
to authenticated
using (
  exists (
    select 1 from public.profiles
    where profiles.id = children.parent_id
      and profiles.auth_user_id = (select auth.uid())
  )
);

create policy "children_update_own"
on public.children for update
to authenticated
using (
  exists (
    select 1 from public.profiles
    where profiles.id = children.parent_id
      and profiles.auth_user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.profiles
    where profiles.id = children.parent_id
      and profiles.auth_user_id = (select auth.uid())
  )
);

create or replace function public.complete_parent_onboarding(
  child_name text,
  target_minutes integer,
  parent_pin text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_auth_user_id uuid := (select auth.uid());
  current_profile_id uuid;
begin
  if current_auth_user_id is null then
    raise exception 'Authentication required';
  end if;
  if pg_catalog.char_length(pg_catalog.btrim(child_name)) not between 1 and 20 then
    raise exception 'Child name must contain between 1 and 20 characters';
  end if;
  if target_minutes not between 1 and 1440 then
    raise exception 'Target minutes must be between 1 and 1440';
  end if;
  if parent_pin operator(pg_catalog.!~) '^[0-9]{4}$' then
    raise exception 'Parent PIN must contain exactly four digits';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(current_auth_user_id::text, 0)
  );

  insert into public.profiles (auth_user_id)
  values (current_auth_user_id)
  on conflict (auth_user_id) do update set updated_at = pg_catalog.now()
  returning id into current_profile_id;

  insert into public.children (parent_id, name, daily_target_minutes)
  values (current_profile_id, pg_catalog.btrim(child_name), target_minutes)
  on conflict (parent_id) do update
  set
    name = excluded.name,
    daily_target_minutes = excluded.daily_target_minutes,
    updated_at = pg_catalog.now();

  insert into public.parent_pin_credentials (parent_id, pin_hash)
  values (
    current_profile_id,
    extensions.crypt(parent_pin, extensions.gen_salt('bf', 12))
  )
  on conflict (parent_id) do update
  set pin_hash = excluded.pin_hash, updated_at = pg_catalog.now();

  update public.profiles
  set onboarding_completed = true, updated_at = pg_catalog.now()
  where id = current_profile_id;
end;
$$;

revoke all on function public.complete_parent_onboarding(text, integer, text)
from public, anon, authenticated;
grant execute on function public.complete_parent_onboarding(text, integer, text) to authenticated;

commit;
