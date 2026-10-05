begin;
do $$
declare owner_id uuid; state text; removed integer; owners uuid[] := '{}'; kept integer;
begin
  if has_function_privilege('anon','public.cleanup_sensitive_action_challenges()','EXECUTE')
    or has_function_privilege('authenticated','public.cleanup_sensitive_action_challenges()','EXECUTE')
    or not has_function_privilege('service_role','public.cleanup_sensitive_action_challenges()','EXECUTE') then
    raise exception 'Unsafe cleanup privilege';
  end if;
  -- One owner per status: the one-pending-per-purpose index forbids stacking pending rows,
  -- so each status gets its own account with a long-expired and a still-active request.
  foreach state in array array['pending','verified','consumed','cancelled'] loop
    owner_id := pg_catalog.gen_random_uuid();
    insert into auth.users(id) values(owner_id);
    owners := owners || owner_id;
    insert into public.sensitive_action_challenges(user_id,purpose,status,created_at,available_at,expires_at)
    values
      (owner_id,'delete_account',state,
        pg_catalog.now()-interval '60 days',pg_catalog.now()-interval '46 days',pg_catalog.now()-interval '25 hours'),
      (owner_id,'reset_parent_pin',state,
        pg_catalog.now()-interval '4 days',pg_catalog.now()-interval '1 day',pg_catalog.now()+interval '5 minutes');
  end loop;
  -- Inside the 24 hour grace period: recently consumed records must survive.
  insert into public.sensitive_action_challenges(user_id,purpose,status,created_at,available_at,expires_at)
    values(owner_id,'reset_parent_pin','consumed',
      pg_catalog.now()-interval '4 days',pg_catalog.now()-interval '1 day',pg_catalog.now()-interval '1 hour');
  removed := public.cleanup_sensitive_action_challenges();
  if removed <> 4 then raise exception 'Expired records not removed'; end if;
  select count(*) into kept from public.sensitive_action_challenges where user_id = any(owners);
  if kept <> 5 then raise exception 'Active or grace-period record removed'; end if;
  if public.cleanup_sensitive_action_challenges() <> 0 then raise exception 'Cleanup not idempotent'; end if;
end;
$$;
rollback;
