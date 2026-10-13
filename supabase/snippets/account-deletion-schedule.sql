-- Run against the intended project only after the MVP migration and Edge deployment.
-- In Vault, first create these secrets using the dashboard (never paste them into Git):
-- account_actions_purge_url = https://<project-ref>.supabase.co/functions/v1/account-actions/purge
-- account_actions_purge_secret = the same random value as ACCOUNT_ACTIONS_PURGE_SECRET
-- ACCOUNT_ACTIONS_ENABLED should remain false until this schedule is installed.
begin;
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
do $$
begin
  if not exists(select 1 from vault.decrypted_secrets where name='account_actions_purge_url'
    and decrypted_secret ~ '^https://[a-z0-9]+\.supabase\.co/functions/v1/account-actions/purge$')
    or not exists(select 1 from vault.decrypted_secrets where name='account_actions_purge_secret'
      and length(decrypted_secret)>=32) then
    raise exception 'Configure the purge URL and a 32+ character scheduler secret in Vault first';
  end if;
end;
$$;
select cron.schedule('ssaida-account-deletion-purge','0 * * * *',$job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name='account_actions_purge_url'),
    headers := pg_catalog.jsonb_build_object('Content-Type','application/json','Authorization',
      'Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='account_actions_purge_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
$job$);
select cron.schedule('ssaida-account-action-cleanup','15 * * * *',$job$
  select public.cleanup_sensitive_action_challenges();
  select public.cleanup_account_deletion_operations();
$job$);
commit;

-- Verify cron.job_run_details AND net._http_response: successful SQL dispatch does not
-- mean HTTP success. Alert on non-2xx responses, stopped=DELETE_FAILED or increasing due.
-- Never select/log request headers: they contain the scheduler bearer.
