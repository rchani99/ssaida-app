begin;

-- A deletion whose waiting period has elapsed must complete even if the owner never opens
-- the app again, so a scheduled job finishes it. The job stays inside exactly the window the
-- UI shows: past available_at and before expires_at. An outage longer than that window
-- lapses the request instead of deleting late, which is what the banner already told the
-- user, and the operator sees it in the job's own due count.
--
-- The claim deliberately does NOT consume the request. An Admin failure must stay retryable
-- inside the window, and a successful Admin deletion removes the row through the existing
-- auth.users cascade, so there is no separate bookkeeping write to lose.

alter table public.sensitive_action_challenges add column purge_claimed_at timestamptz;

create index sensitive_action_due_deletions
  on public.sensitive_action_challenges(available_at)
  where purpose = 'delete_account' and status = 'pending';

create function public.claim_due_account_deletion(p_retry_after interval default interval '1 hour')
returns uuid language plpgsql security definer set search_path = '' as $$
declare candidate uuid; locked_id uuid;
begin
  if p_retry_after is null or p_retry_after < interval '1 minute' then
    raise exception 'Retry interval too small' using errcode = '22023';
  end if;
  -- Unlocked probe first: the row lock must be taken after auth.users, matching the order
  -- prepare_account_deletion uses, so a parent pressing delete cannot deadlock the job.
  select user_id into candidate
  from public.sensitive_action_challenges
  where purpose = 'delete_account'
    and status = 'pending'
    and available_at <= pg_catalog.clock_timestamp()
    and expires_at > pg_catalog.clock_timestamp()
    and (purge_claimed_at is null
      or purge_claimed_at < pg_catalog.clock_timestamp() - p_retry_after)
  order by available_at
  limit 1;
  if candidate is null then return null; end if;

  perform 1 from auth.users where id = candidate for key share;
  if not found then return null; end if;

  -- Re-check under the row lock: another worker may have claimed it since the probe.
  select id into locked_id
  from public.sensitive_action_challenges
  where user_id = candidate
    and purpose = 'delete_account'
    and status = 'pending'
    and available_at <= pg_catalog.clock_timestamp()
    and expires_at > pg_catalog.clock_timestamp()
    and (purge_claimed_at is null
      or purge_claimed_at < pg_catalog.clock_timestamp() - p_retry_after)
  limit 1
  for update skip locked;
  if not found then return null; end if;

  update public.sensitive_action_challenges
    set purge_claimed_at = pg_catalog.clock_timestamp()
    where id = locked_id;
  return candidate;
end;
$$;

-- Operational signal: a number that keeps growing means the job is not running.
create function public.count_due_account_deletions()
returns integer language sql security definer stable set search_path = '' as $$
  select pg_catalog.count(*)::integer
  from public.sensitive_action_challenges
  where purpose = 'delete_account'
    and status = 'pending'
    and available_at <= pg_catalog.clock_timestamp()
    and expires_at > pg_catalog.clock_timestamp();
$$;

revoke all on function public.claim_due_account_deletion(interval),
  public.count_due_account_deletions() from public, anon, authenticated;
grant execute on function public.claim_due_account_deletion(interval),
  public.count_due_account_deletions() to service_role;

commit;
