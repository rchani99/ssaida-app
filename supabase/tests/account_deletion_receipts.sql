begin;
do $$
declare owner_id uuid:=pg_catalog.gen_random_uuid(); other_id uuid:=pg_catalog.gen_random_uuid();
  proof_id uuid; other_proof uuid; op jsonb; other_op jsonb; hash text:=pg_catalog.repeat('a',64);
begin
  if has_table_privilege('anon','public.account_deletion_operations','SELECT') or
    has_table_privilege('authenticated','public.account_deletion_operations','SELECT') or
    has_function_privilege('anon','public.get_account_deletion_status(uuid,text)','EXECUTE') or
    has_function_privilege('authenticated','public.start_account_deletion(uuid,uuid,uuid)','EXECUTE') or
    not has_function_privilege('service_role','public.get_account_deletion_status(uuid,text)','EXECUTE') then
    raise exception 'Unsafe receipt privileges'; end if;
  insert into auth.users(id) values(owner_id),(other_id);
  proof_id := (public.request_sensitive_action(owner_id,'delete_account')).id;
  other_proof := (public.request_sensitive_action(other_id,'delete_account')).id;
  -- Fixture only: stand in for the elapsed waiting period these receipt paths run after.
  update public.sensitive_action_challenges
    set created_at=pg_catalog.clock_timestamp()-interval '15 days',
        available_at=pg_catalog.clock_timestamp()-interval '1 second'
    where id in (proof_id,other_proof);
  op:=public.prepare_account_deletion(owner_id,proof_id,hash);
  other_op:=public.prepare_account_deletion(other_id,other_proof,pg_catalog.repeat('b',64));
  if public.get_account_deletion_status((op->>'operationId')::uuid,hash)<>'pending' then raise exception 'Prepared status'; end if;
  if public.get_account_deletion_status((op->>'operationId')::uuid,pg_catalog.repeat('b',64))<>'expired' or
    public.get_account_deletion_status((other_op->>'operationId')::uuid,hash)<>'expired' or
    public.get_account_deletion_status(pg_catalog.gen_random_uuid(),hash)<>'expired' then raise exception 'Capability mismatch'; end if;
  if public.start_account_deletion(other_id,other_proof,(op->>'operationId')::uuid) then raise exception 'Cross user claim'; end if;
  if not public.start_account_deletion(owner_id,proof_id,(op->>'operationId')::uuid) then raise exception 'Claim failed'; end if;
  if public.start_account_deletion(owner_id,proof_id,(op->>'operationId')::uuid) then raise exception 'Duplicate claim'; end if;
  -- A failed transaction must roll back the deletion AND its terminal receipt together.
  begin
    delete from auth.users where id=owner_id;
    raise exception 'simulate later transaction failure';
  exception when raise_exception then null;
  end;
  if not exists(select 1 from auth.users where id=owner_id) or
    public.get_account_deletion_status((op->>'operationId')::uuid,hash)<>'pending' then raise exception 'Rollback inconsistency'; end if;
  delete from auth.users where id=owner_id;
  if exists(select 1 from public.sensitive_action_challenges where id=proof_id) then raise exception 'Proof cascade'; end if;
  if not exists(select 1 from public.account_deletion_operations where id=(op->>'operationId')::uuid
    and state='DELETED' and user_id is null and challenge_id is null) then raise exception 'Receipt cascade/PII'; end if;
  if public.get_account_deletion_status((op->>'operationId')::uuid,hash)<>'deleted' or
    public.get_account_deletion_status((op->>'operationId')::uuid,hash)<>'deleted' then raise exception 'Repeat query'; end if;
  update public.account_deletion_operations set execute_before=pg_catalog.clock_timestamp()-interval '1 second'
    where id=(other_op->>'operationId')::uuid;
  if public.get_account_deletion_status((other_op->>'operationId')::uuid,pg_catalog.repeat('b',64))<>'failed' or
    public.start_account_deletion(other_id,other_proof,(other_op->>'operationId')::uuid) then raise exception 'Expired execution window'; end if;
  update public.account_deletion_operations set expires_at=pg_catalog.clock_timestamp()-interval '1 hour' where id=(op->>'operationId')::uuid;
  if public.get_account_deletion_status((op->>'operationId')::uuid,hash)<>'expired' then raise exception 'Receipt expiry'; end if;
  if public.cleanup_account_deletion_operations()<>0 then raise exception 'Retention violated'; end if;
  update public.account_deletion_operations set expires_at=pg_catalog.clock_timestamp()-interval '25 hours' where id=(op->>'operationId')::uuid;
  if public.cleanup_account_deletion_operations()<>1 or public.cleanup_account_deletion_operations()<>0 then raise exception 'TTL cleanup'; end if;
end;
$$;
rollback;
