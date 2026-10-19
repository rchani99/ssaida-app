-- Resend delivery backoff only; authentication and the 14-day policy are unchanged.
-- Apply before deploying the stage-3 worker. No provider secrets belong in SQL.
begin;

-- Replace the signature without creating ambiguous PostgREST overloads. The
-- default preserves calls from the stage-2 worker until the function is deployed.
drop function public.finish_deletion_email_delivery(uuid,uuid,text);
create function public.finish_deletion_email_delivery(
  p_id uuid,p_lease_token uuid,p_outcome text,p_retry_after_seconds integer default 15
) returns void language plpgsql security definer set search_path='' as $$
declare
  delay_seconds integer := greatest(15,coalesce(p_retry_after_seconds,15));
begin
  if p_outcome is null or p_outcome not in ('SENT','RETRY','UNKNOWN','FAILED') then
    raise exception 'Invalid outcome';
  end if;
  update public.account_deletion_email_challenges set
    delivery=case when p_outcome='RETRY' and
      (send_attempts>=3 or delay_seconds>600 or
       clock_timestamp()+make_interval(secs=>least(delay_seconds,601))>=expires_at)
      then 'FAILED' else p_outcome end,
    next_send_at=clock_timestamp()+make_interval(secs=>least(delay_seconds,601)),
    lease_token=null,lease_until=null,
    ciphertext=case when p_outcome='RETRY' and send_attempts<3 and delay_seconds<=600
      and clock_timestamp()+make_interval(secs=>least(delay_seconds,601))<expires_at
      then ciphertext else null end
  where id=p_id and delivery='SENDING' and lease_token=p_lease_token
    and lease_until>clock_timestamp() and invalidated_at is null;
end $$;
revoke all on function public.finish_deletion_email_delivery(uuid,uuid,text,integer)
  from public,anon,authenticated;
grant execute on function public.finish_deletion_email_delivery(uuid,uuid,text,integer) to service_role;

commit;
