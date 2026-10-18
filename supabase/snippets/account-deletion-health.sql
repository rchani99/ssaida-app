-- Read-only operational check. Never select cron.command or request headers (secrets).
begin read only;
select pg_catalog.jsonb_build_object(
  'checked_at', pg_catalog.clock_timestamp(),
  'due', public.count_due_account_deletions(),
  'oldest_due_at', (select min(available_at) from public.sensitive_action_challenges
    where purpose='delete_account' and status in ('pending','consumed') and available_at<=now()),
  'requests', (select pg_catalog.jsonb_build_object(
    'waiting', count(*) filter(where status='pending' and available_at>now()),
    'due', count(*) filter(where status='pending' and available_at<=now()),
    'processing', count(*) filter(where status='consumed'))
    from public.sensitive_action_challenges where purpose='delete_account'),
  'jobs', (select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'name', j.jobname, 'schedule', j.schedule, 'active', j.active,
    'last_run', (select max(start_time) from cron.job_run_details r where r.jobid=j.jobid),
    'last_status', (select status from cron.job_run_details r where r.jobid=j.jobid order by start_time desc limit 1)))
    from cron.job j where j.jobname in ('ssaida-account-deletion-purge','ssaida-account-action-cleanup')),
  'recent_http', (select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id',r.id,'created',r.created,'status_code',r.status_code,'timed_out',r.timed_out,
    'transport_error',r.error_msg is not null)), '[]'::jsonb)
    from (select id,created,status_code,timed_out,error_msg from net._http_response
      where created>now()-interval '3 hours' order by created desc limit 20) r)
) as deletion_health;
commit;
