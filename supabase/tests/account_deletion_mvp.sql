begin;
do $$
declare
  a uuid:=pg_catalog.gen_random_uuid(); b uuid:=pg_catalog.gen_random_uuid();
  request public.sensitive_action_challenges; watched jsonb; second_watch jsonb; manual jsonb;
  hash text:=pg_catalog.repeat('a',64);
begin
  insert into auth.users(id) values(a),(b);
  if has_function_privilege('authenticated','public.watch_account_deletion(uuid,uuid,text)','EXECUTE')
    or has_function_privilege('anon','public.watch_account_deletion(uuid,uuid,text)','EXECUTE')
    or not has_function_privilege('service_role','public.watch_account_deletion(uuid,uuid,text)','EXECUTE') then
    raise exception 'Unsafe watch permissions';
  end if;
  request:=public.request_sensitive_action(a,'delete_account');
  watched:=public.watch_account_deletion(a,request.id,hash);
  second_watch:=public.watch_account_deletion(a,request.id,pg_catalog.repeat('b',64));
  if watched->>'operationId'=second_watch->>'operationId' then raise exception 'Receipts not isolated'; end if;
  if (watched->>'expiresAt')::timestamptz<request.expires_at+interval '29 days' then raise exception 'Watch expires before recovery window'; end if;
  if public.get_account_deletion_status((watched->>'operationId')::uuid,hash)<>'pending' then raise exception 'Watch status wrong'; end if;
  if public.start_account_deletion(a,request.id,(watched->>'operationId')::uuid) then raise exception 'Watcher bypassed wait'; end if;
  begin
    perform public.watch_account_deletion(b,request.id,hash);
    raise exception 'Foreign watcher accepted';
  exception when others then if sqlerrm<>'Request unavailable' then raise; end if; end;
  if not public.cancel_sensitive_action(a,request.id) then raise exception 'Waiting cancel failed'; end if;
  if public.get_account_deletion_status((watched->>'operationId')::uuid,hash)<>'failed' then raise exception 'Cancelled watcher still pending'; end if;

  update public.sensitive_action_challenges set created_at=created_at-interval '1 minute' where user_id=a;
  request:=public.request_sensitive_action(a,'delete_account');
  watched:=public.watch_account_deletion(a,request.id,hash);
  update public.sensitive_action_challenges set created_at=created_at-interval '15 days',available_at=pg_catalog.clock_timestamp()-interval '1 second' where id=request.id;
  if public.claim_due_account_deletion() is distinct from a then raise exception 'Worker claim failed'; end if;
  if public.cancel_sensitive_action(a,request.id) then raise exception 'Claimed request cancellation succeeded'; end if;
  perform pg_catalog.set_config('request.jwt.claim.sub',a::text,true);
  if not exists(select 1 from public.list_pending_sensitive_actions() where purpose='delete_account' and processing) then raise exception 'Processing not visible'; end if;
  update public.sensitive_action_challenges set expires_at=pg_catalog.clock_timestamp()-interval '2 days',purge_claimed_at=pg_catalog.clock_timestamp()-interval '2 hours' where id=request.id;
  perform public.cleanup_sensitive_action_challenges();
  if public.claim_due_account_deletion() is distinct from a then raise exception 'Failed worker lost after expiry'; end if;
  if public.get_account_deletion_status((watched->>'operationId')::uuid,hash)<>'pending' then raise exception 'Accepted deletion falsely failed'; end if;
  delete from auth.users where id=a;
  if public.get_account_deletion_status((watched->>'operationId')::uuid,hash)<>'deleted' then raise exception 'Automatic deletion not observable'; end if;

  request:=public.request_sensitive_action(b,'delete_account');
  update public.sensitive_action_challenges set created_at=created_at-interval '15 days',available_at=pg_catalog.clock_timestamp()-interval '1 second' where id=request.id;
  manual:=public.prepare_account_deletion(b,request.id,hash);
  if not public.start_account_deletion(b,request.id,(manual->>'operationId')::uuid) then raise exception 'Manual claim failed'; end if;
  if public.claim_due_account_deletion() is not null then raise exception 'Worker duplicated active manual operation'; end if;
  update public.sensitive_action_challenges set purge_claimed_at=pg_catalog.clock_timestamp()-interval '2 hours' where id=request.id;
  if public.claim_due_account_deletion() is distinct from b then raise exception 'Manual Admin failure not retried'; end if;
  if public.cancel_sensitive_action(b,request.id) then raise exception 'Manual claim cancelled'; end if;
end;
$$;
rollback;
