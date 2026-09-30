begin;

create index sensitive_action_expiry on public.sensitive_action_challenges(expires_at);

-- Run hourly (repeat bounded batches if needed). Do not install a production schedule here.
-- Keep every status until 24 hours AFTER proof expiry, including recently consumed operations.
-- SKIP LOCKED leaves transactions currently verifying/consuming/resetting a PIN untouched.
create function public.cleanup_sensitive_action_challenges()
returns integer language plpgsql security definer set search_path = '' as $$
declare removed integer;
begin
  with candidates as (
    select id from public.sensitive_action_challenges
    where expires_at < pg_catalog.clock_timestamp() - interval '24 hours'
    order by expires_at
    limit 1000
    for update skip locked
  )
  delete from public.sensitive_action_challenges as challenge
  using candidates where challenge.id = candidates.id;
  get diagnostics removed = row_count;
  return removed;
end;
$$;

revoke all on function public.cleanup_sensitive_action_challenges() from public, anon, authenticated;
grant execute on function public.cleanup_sensitive_action_challenges() to service_role;

commit;
