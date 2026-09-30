begin;
do $$
declare owner_id uuid := pg_catalog.gen_random_uuid(); state text; removed integer;
begin
  if has_function_privilege('anon','public.cleanup_sensitive_action_challenges()','EXECUTE')
    or has_function_privilege('authenticated','public.cleanup_sensitive_action_challenges()','EXECUTE')
    or not has_function_privilege('service_role','public.cleanup_sensitive_action_challenges()','EXECUTE') then
    raise exception 'Unsafe cleanup privilege';
  end if;
  insert into auth.users(id) values(owner_id);
  foreach state in array array['pending','verified','consumed','cancelled'] loop
    insert into public.sensitive_action_challenges(user_id,purpose,google_sub,nonce,status,expires_at)
    values(owner_id,'delete_account','isolated',pg_catalog.gen_random_uuid()::text,state,pg_catalog.now()-interval '25 hours'),
      (owner_id,'delete_account','isolated',pg_catalog.gen_random_uuid()::text,state,pg_catalog.now()+interval '5 minutes');
  end loop;
  insert into public.sensitive_action_challenges(user_id,purpose,google_sub,nonce,status,expires_at)
    values(owner_id,'reset_parent_pin','isolated',pg_catalog.gen_random_uuid()::text,'consumed',pg_catalog.now()-interval '1 hour');
  removed := public.cleanup_sensitive_action_challenges();
  if removed <> 4 then raise exception 'Expired records not removed'; end if;
  if (select count(*) from public.sensitive_action_challenges where user_id=owner_id) <> 5 then
    raise exception 'Active or grace-period proof removed';
  end if;
  if public.cleanup_sensitive_action_challenges() <> 0 then raise exception 'Cleanup not idempotent'; end if;
end;
$$;
rollback;
