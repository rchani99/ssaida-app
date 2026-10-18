begin;
do $$
declare a uuid:=pg_catalog.gen_random_uuid(); b uuid:=pg_catalog.gen_random_uuid();
  request public.sensitive_action_challenges; next_request public.sensitive_action_challenges;
  watched jsonb; manual jsonb; hash text:=pg_catalog.repeat('d',64);
begin
  insert into auth.users(id) values(a),(b);
  request:=public.request_sensitive_action(a,'delete_account');
  watched:=public.watch_account_deletion(a,request.id,hash);
  update public.sensitive_action_challenges set created_at=pg_catalog.clock_timestamp()-interval '30 days',
    available_at=pg_catalog.clock_timestamp()-interval '16 days',expires_at=pg_catalog.clock_timestamp()-interval '9 days'
    where id=request.id;
  perform public.cleanup_sensitive_action_challenges();
  next_request:=public.request_sensitive_action(a,'delete_account');
  if request.id<>next_request.id then raise exception 'Outage restarted waiting period'; end if;
  perform public.request_sensitive_action(a,'reset_parent_pin');
  if not exists(select 1 from public.sensitive_action_challenges where id=request.id and status='pending') then
    raise exception 'PIN request erased pending deletion'; end if;
  perform pg_catalog.set_config('request.jwt.claim.sub',a::text,true);
  if not exists(select 1 from public.list_pending_sensitive_actions() where purpose='delete_account' and not processing) then
    raise exception 'Delayed deletion hidden from owner'; end if;
  update public.account_deletion_operations set execute_before=pg_catalog.clock_timestamp()-interval '1 day'
    where id=(watched->>'operationId')::uuid;
  if public.get_account_deletion_status((watched->>'operationId')::uuid,hash)<>'pending' then
    raise exception 'Delayed deletion falsely reported failed'; end if;
  manual:=public.prepare_account_deletion(a,request.id,hash);
  if (manual->>'expiresAt')::timestamptz<pg_catalog.clock_timestamp()+interval '29 days' then
    raise exception 'Late receipt already expired'; end if;
  if not public.cancel_sensitive_action(a,request.id) then raise exception 'Delayed cancellation failed'; end if;
  if public.start_account_deletion(a,request.id,(manual->>'operationId')::uuid) then raise exception 'Cancelled deletion started'; end if;
  if public.get_account_deletion_status((watched->>'operationId')::uuid,hash)<>'failed' then raise exception 'Cancellation not observable'; end if;

  -- Separate aged request: manual claim and PIN issuance must preserve retry evidence.
  request:=public.request_sensitive_action(b,'delete_account');
  update public.sensitive_action_challenges set created_at=pg_catalog.clock_timestamp()-interval '30 days',
    available_at=pg_catalog.clock_timestamp()-interval '16 days',expires_at=pg_catalog.clock_timestamp()-interval '9 days'
    where id=request.id;
  manual:=public.prepare_account_deletion(b,request.id,hash);
  if not public.start_account_deletion(b,request.id,(manual->>'operationId')::uuid) then raise exception 'Late manual deletion rejected'; end if;
  perform public.request_sensitive_action(b,'reset_parent_pin');
  perform public.cleanup_sensitive_action_challenges();
  if not exists(select 1 from public.sensitive_action_challenges where id=request.id and status='consumed') then
    raise exception 'PIN request erased claimed deletion'; end if;
  begin
    perform public.request_sensitive_action(b,'delete_account');
    raise exception 'Duplicate deletion request allowed';
  exception when others then if sqlerrm<>'Deletion already processing' then raise; end if; end;
  update public.sensitive_action_challenges set purge_claimed_at=pg_catalog.clock_timestamp()-interval '2 hours' where id=request.id;

  -- A failing oldest account must not starve untouched requests on every hourly run.
  update public.sensitive_action_challenges set created_at=created_at-interval '1 minute' where user_id=a;
  next_request:=public.request_sensitive_action(a,'delete_account');
  update public.sensitive_action_challenges set created_at=created_at-interval '15 days',
    available_at=pg_catalog.clock_timestamp()-interval '1 day' where id=next_request.id;
  if public.claim_due_account_deletion() is distinct from a then raise exception 'Retry starved unclaimed request'; end if;
  if public.claim_due_account_deletion() is distinct from b then raise exception 'Claimed retry disappeared'; end if;
  delete from auth.users where id=b;
  if public.get_account_deletion_status((manual->>'operationId')::uuid,hash)<>'deleted' then raise exception 'Late completion not recorded'; end if;
end;
$$;
rollback;
