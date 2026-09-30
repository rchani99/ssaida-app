begin;

do $$
declare
  a uuid := pg_catalog.gen_random_uuid(); b uuid := pg_catalog.gen_random_uuid();
  child_a uuid; child_b uuid; challenge public.sensitive_action_challenges;
  catalog_before bigint; fn regprocedure; stored text;
  catalog_id uuid; collectible_id uuid; task_id uuid; growth_id uuid;
begin
  insert into auth.users(id) values(a),(b);
  perform pg_catalog.set_config('request.jwt.claim.sub', a::text, true);
  perform public.complete_parent_onboarding('Isolated A',60,'1234');
  perform pg_catalog.set_config('request.jwt.claim.sub', b::text, true);
  perform public.complete_parent_onboarding('Isolated B',60,'1234');
  select c.id into child_a from public.children c join public.profiles p on p.id=c.parent_id where p.auth_user_id=a;
  select c.id into child_b from public.children c join public.profiles p on p.id=c.parent_id where p.auth_user_id=b;

  foreach fn in array array[
    'public.begin_sensitive_action(uuid,text,text,text)'::regprocedure,
    'public.verify_sensitive_action(uuid,uuid,timestamptz)'::regprocedure,
    'public.cancel_sensitive_action(uuid,uuid)'::regprocedure,
    'public.consume_sensitive_action(uuid,uuid,text)'::regprocedure,
    'public.reset_parent_pin_with_proof(uuid,uuid,text)'::regprocedure
  ] loop
    if has_function_privilege('anon',fn,'EXECUTE') or has_function_privilege('authenticated',fn,'EXECUTE') then
      raise exception 'Client can invoke server contract';
    end if;
    if not has_function_privilege('service_role',fn,'EXECUTE') then raise exception 'Missing server grant'; end if;
    if not exists (select 1 from pg_proc where oid=fn and prosecdef and proconfig @> array['search_path=""']) then
      raise exception 'Unsafe function configuration';
    end if;
  end loop;
  if has_table_privilege('authenticated','public.sensitive_action_challenges','SELECT')
    or has_table_privilege('anon','public.sensitive_action_challenges','SELECT') then raise exception 'Proofs exposed'; end if;

  challenge := public.begin_sensitive_action(a,'reset_parent_pin','google-a',pg_catalog.gen_random_uuid()::text);
  if public.reset_parent_pin_with_proof(a,challenge.id,'5678') then raise exception 'Unverified reset'; end if;
  if public.verify_sensitive_action(a,challenge.id,pg_catalog.now()-interval '1 hour') then raise exception 'Stale auth accepted'; end if;
  if public.verify_sensitive_action(b,challenge.id,pg_catalog.clock_timestamp()) then raise exception 'Foreign verify'; end if;
  if not public.verify_sensitive_action(a,challenge.id,pg_catalog.clock_timestamp()) then raise exception 'Fresh verify failed'; end if;
  if public.consume_sensitive_action(a,challenge.id,'delete_account') then raise exception 'Wrong purpose accepted'; end if;
  if public.reset_parent_pin_with_proof(b,challenge.id,'5678') then raise exception 'Foreign reset'; end if;
  update public.parent_pin_credentials set failed_attempts=5,locked_until=pg_catalog.now()+interval '5 minutes'
    where parent_id=(select id from public.profiles where auth_user_id=a);
  if not public.reset_parent_pin_with_proof(a,challenge.id,'5678') then raise exception 'Reset failed'; end if;
  if public.reset_parent_pin_with_proof(a,challenge.id,'9999') then raise exception 'Replay accepted'; end if;
  select pin_hash into stored from public.parent_pin_credentials where parent_id=(select id from public.profiles where auth_user_id=a);
  if stored = '5678' or stored not like '$2a$12$%' or extensions.crypt('5678',stored) <> stored then raise exception 'Hash mismatch'; end if;
  if exists (select 1 from public.parent_pin_credentials where parent_id=(select id from public.profiles where auth_user_id=a)
    and (failed_attempts<>0 or locked_until is not null)) then raise exception 'Lock not reset'; end if;
  perform pg_catalog.set_config('request.jwt.claim.sub', b::text, true);
  if public.verify_parent_pin('1234') is distinct from true then raise exception 'Other credential changed'; end if;

  -- Controlled fixture timestamps bypass the issuance throttle only inside this transaction.
  update public.sensitive_action_challenges set created_at=created_at-interval '1 minute' where user_id=a;
  challenge := public.begin_sensitive_action(a,'delete_account','google-a',pg_catalog.gen_random_uuid()::text);
  perform public.verify_sensitive_action(a,challenge.id,pg_catalog.clock_timestamp());
  perform public.cancel_sensitive_action(a,challenge.id);
  if public.consume_sensitive_action(a,challenge.id,'delete_account') then raise exception 'Cancelled consumed'; end if;
  if public.verify_sensitive_action(a,challenge.id,pg_catalog.clock_timestamp()) then raise exception 'Cancelled reverified'; end if;
  update public.sensitive_action_challenges set created_at=created_at-interval '1 minute' where user_id=a;
  challenge := public.begin_sensitive_action(a,'delete_account','google-a',pg_catalog.gen_random_uuid()::text);
  perform public.verify_sensitive_action(a,challenge.id,pg_catalog.clock_timestamp());
  update public.sensitive_action_challenges set expires_at=pg_catalog.now()-interval '1 second' where id=challenge.id;
  if public.consume_sensitive_action(a,challenge.id,'delete_account') then raise exception 'Expired consumed'; end if;

  -- Exercise the real preexisting FK graph, including plans/tasks and collectible growth events.
  perform pg_catalog.set_config('request.jwt.claim.sub', a::text, true);
  insert into public.study_items(child_id,item_type,name,estimated_minutes,study_weekdays)
    values(child_a,'ACTIVITY','Isolated study',20,array[1,2,3,4,5,6,7]::smallint[]);
  perform public.ensure_daily_plan(child_a,'2031-01-01');
  select t.id into task_id from public.daily_tasks t join public.daily_plans p on p.id=t.daily_plan_id where p.child_id=child_a limit 1;
  if task_id is null then raise exception 'Task fixture missing'; end if;
  insert into public.collectible_catalog(theme_code,code,name,sort_order)
    values('DINO', 'isolated-'||a::text, 'Isolated catalog', 1) returning id into catalog_id;
  insert into public.child_collectibles(child_id,theme_code,collectible_catalog_id,sequence_no,growth_goal_snapshot)
    values(child_a,'DINO',catalog_id,1,7) returning id into collectible_id;
  insert into public.collectible_growth_events(child_collectible_id,daily_task_id,growth_points,source_type)
    values(collectible_id,task_id,1,'DIRECT_TASK') returning id into growth_id;
  select count(*) into catalog_before from public.collectible_catalog;
  delete from auth.users where id=a;
  if exists(select 1 from public.profiles where auth_user_id=a)
    or exists(select 1 from public.children where id=child_a)
    or exists(select 1 from public.study_items where child_id=child_a)
    or exists(select 1 from public.daily_plans where child_id=child_a)
    or exists(select 1 from public.daily_tasks where id=task_id)
    or exists(select 1 from public.collectible_growth_events where id=growth_id)
    or exists(select 1 from public.child_collectibles where child_id=child_a)
    or exists(select 1 from public.sensitive_action_challenges where user_id=a) then raise exception 'Cascade incomplete'; end if;
  if not exists(select 1 from public.children where id=child_b) then raise exception 'Other account deleted'; end if;
  if (select count(*) from public.collectible_catalog) <> catalog_before then raise exception 'Catalog deleted'; end if;
end;
$$;

rollback;
