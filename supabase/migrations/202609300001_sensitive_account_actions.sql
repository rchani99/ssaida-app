begin;

-- Server-only, short-lived authorization records. Never store PINs or provider tokens.
create table public.sensitive_action_challenges (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  purpose text not null check (purpose in ('delete_account', 'reset_parent_pin')),
  google_sub text not null,
  nonce text not null unique,
  status text not null default 'pending'
    check (status in ('pending', 'verified', 'consumed', 'cancelled')),
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  expires_at timestamptz not null default (pg_catalog.clock_timestamp() + interval '5 minutes')
);
create index sensitive_action_user_created on public.sensitive_action_challenges(user_id, created_at desc);
alter table public.sensitive_action_challenges enable row level security;
revoke all on public.sensitive_action_challenges from public, anon, authenticated;
grant select on public.sensitive_action_challenges to service_role;

create function public.begin_sensitive_action(p_user_id uuid, p_purpose text, p_google_sub text, p_nonce text)
returns public.sensitive_action_challenges
language plpgsql security definer set search_path = '' as $$
declare result public.sensitive_action_challenges;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 0));
  if exists (select 1 from public.sensitive_action_challenges where user_id = p_user_id
    and created_at > pg_catalog.clock_timestamp() - interval '30 seconds') then
    raise exception 'Rate limited' using errcode = 'P0001';
  end if;
  if p_nonce is null or pg_catalog.length(p_nonce) < 32 or p_google_sub is null or p_google_sub = '' then
    raise exception 'Invalid challenge' using errcode = '22023';
  end if;
  update public.sensitive_action_challenges set status = 'cancelled'
    where user_id = p_user_id and status in ('pending', 'verified');
  delete from public.sensitive_action_challenges where user_id = p_user_id
    and expires_at < pg_catalog.clock_timestamp() - interval '1 day';
  insert into public.sensitive_action_challenges(user_id, purpose, google_sub, nonce)
    values(p_user_id, p_purpose, p_google_sub, p_nonce) returning * into result;
  return result;
end;
$$;

create function public.verify_sensitive_action(p_user_id uuid, p_id uuid, p_auth_time timestamptz)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  -- Only the Edge Function may call this after signature, audience, subject and nonce verification.
  update public.sensitive_action_challenges set status = 'verified'
    where id = p_id and user_id = p_user_id and status = 'pending'
    and expires_at > pg_catalog.clock_timestamp()
    and p_auth_time >= created_at - interval '5 seconds'
    and p_auth_time >= pg_catalog.clock_timestamp() - interval '5 minutes'
    and p_auth_time <= pg_catalog.clock_timestamp() + interval '5 seconds';
  return found;
end;
$$;

create function public.cancel_sensitive_action(p_user_id uuid, p_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  update public.sensitive_action_challenges set status = 'cancelled'
    where id = p_id and user_id = p_user_id and status in ('pending', 'verified', 'cancelled');
  return found;
end;
$$;

create function public.consume_sensitive_action(p_user_id uuid, p_id uuid, p_purpose text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  update public.sensitive_action_challenges set status = 'consumed'
    where id = p_id and user_id = p_user_id and purpose = p_purpose and status = 'verified'
    and expires_at > pg_catalog.clock_timestamp();
  return found;
end;
$$;

create function public.reset_parent_pin_with_proof(p_user_id uuid, p_id uuid, p_new_pin text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if p_new_pin is null or p_new_pin operator(pg_catalog.!~) '^[0-9]{4}$' then
    raise exception 'Invalid PIN format' using errcode = '22023';
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

revoke all on function public.begin_sensitive_action(uuid,text,text,text),
  public.verify_sensitive_action(uuid,uuid,timestamptz),
  public.cancel_sensitive_action(uuid,uuid), public.consume_sensitive_action(uuid,uuid,text),
  public.reset_parent_pin_with_proof(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.begin_sensitive_action(uuid,text,text,text),
  public.verify_sensitive_action(uuid,uuid,timestamptz),
  public.cancel_sensitive_action(uuid,uuid), public.consume_sensitive_action(uuid,uuid,text),
  public.reset_parent_pin_with_proof(uuid,uuid,text) to service_role;

commit;
