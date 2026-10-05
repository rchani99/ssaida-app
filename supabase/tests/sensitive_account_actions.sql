begin;

do $$
declare
  a uuid := pg_catalog.gen_random_uuid(); b uuid := pg_catalog.gen_random_uuid();
  child_a uuid; child_b uuid; request public.sensitive_action_challenges;
  again public.sensitive_action_challenges;
  catalog_before bigint; fn regprocedure; stored text; rows bigint; claimed uuid;
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
    'public.request_sensitive_action(uuid,text)'::regprocedure,
    'public.cancel_sensitive_action(uuid,uuid)'::regprocedure,
    'public.cancel_pending_sensitive_action(uuid,text)'::regprocedure,
    'public.consume_sensitive_action(uuid,uuid,text)'::regprocedure,
    'public.reset_parent_pin_with_proof(uuid,uuid,text)'::regprocedure,
    'public.claim_due_account_deletion(interval)'::regprocedure,
    'public.count_due_account_deletions()'::regprocedure
  ] loop
    if has_function_privilege('anon',fn,'EXECUTE') or has_function_privilege('authenticated',fn,'EXECUTE') then
      raise exception 'Client can invoke server contract';
    end if;
    if not has_function_privilege('service_role',fn,'EXECUTE') then raise exception 'Missing server grant'; end if;
    if not exists (select 1 from pg_proc where oid=fn and prosecdef and proconfig @> array['search_path=""']) then
      raise exception 'Unsafe function configuration';
    end if;
  end loop;
  -- The Google proof contract must be gone, not merely unused.
  if exists (select 1 from pg_proc where proname in ('begin_sensitive_action','verify_sensitive_action')
    and pronamespace='public'::regnamespace) then raise exception 'Google proof contract still installed'; end if;
  if has_table_privilege('authenticated','public.sensitive_action_challenges','SELECT')
    or has_table_privilege('anon','public.sensitive_action_challenges','SELECT') then raise exception 'Requests exposed'; end if;
  -- Display-only projection is the one client-callable read.
  fn := 'public.list_pending_sensitive_actions()'::regprocedure;
  if not has_function_privilege('authenticated',fn,'EXECUTE') then raise exception 'Banner read missing'; end if;
  if has_function_privilege('anon',fn,'EXECUTE') then raise exception 'Anon can read requests'; end if;
  if not exists (select 1 from pg_proc where oid=fn and prosecdef and proconfig @> array['search_path=""']) then
    raise exception 'Unsafe projection configuration';
  end if;

  -- Waiting periods come from the server, never from a caller argument.
  if public.sensitive_action_delay('reset_parent_pin') <> interval '72 hours' then raise exception 'PIN delay wrong'; end if;
  if public.sensitive_action_delay('delete_account') <> interval '14 days' then raise exception 'Deletion delay wrong'; end if;
  begin
    request := public.request_sensitive_action(a,'change_email');
    raise exception 'Unknown purpose accepted';
  exception when sqlstate '22023' then null;
  end;

  request := public.request_sensitive_action(a,'reset_parent_pin');
  if request.available_at < request.created_at + interval '71 hours'
    or request.available_at > request.created_at + interval '73 hours' then raise exception 'PIN window wrong'; end if;
  if request.expires_at <= request.available_at then raise exception 'No action window after wait'; end if;
  -- Re-requesting must return the original record: no restart, no shortening, no extension.
  again := public.request_sensitive_action(a,'reset_parent_pin');
  if again.id <> request.id or again.available_at <> request.available_at then raise exception 'Window moved'; end if;
  if (select count(*) from public.sensitive_action_challenges where user_id=a and status='pending') <> 1 then
    raise exception 'Duplicate pending request';
  end if;
  if public.consume_sensitive_action(a,request.id,'reset_parent_pin') then raise exception 'Consumed while waiting'; end if;
  if public.reset_parent_pin_with_proof(a,request.id,'5678') then raise exception 'Reset while waiting'; end if;

  -- Entering the current PIN clears a waiting reset. This is the asymmetry the delay relies on.
  perform pg_catalog.set_config('request.jwt.claim.sub', a::text, true);
  if public.verify_parent_pin('9999') is distinct from false then raise exception 'Wrong PIN accepted'; end if;
  if not exists (select 1 from public.sensitive_action_challenges where id=request.id and status='pending') then
    raise exception 'Wrong PIN cancelled the reset';
  end if;
  if public.verify_parent_pin('1234') is distinct from true then raise exception 'Correct PIN rejected'; end if;
  if exists (select 1 from public.sensitive_action_challenges where id=request.id and status='pending') then
    raise exception 'Correct PIN did not cancel the waiting reset';
  end if;
  if public.consume_sensitive_action(a,request.id,'reset_parent_pin') then raise exception 'Cancelled consumed'; end if;

  -- Fixture only: shifting the stored timestamps stands in for elapsed wall-clock time.
  update public.sensitive_action_challenges set created_at=created_at-interval '4 days' where user_id=a;
  request := public.request_sensitive_action(a,'reset_parent_pin');
  update public.sensitive_action_challenges
    set created_at=pg_catalog.clock_timestamp()-interval '4 days',
        available_at=pg_catalog.clock_timestamp()-interval '1 second'
    where id=request.id;
  if public.consume_sensitive_action(b,request.id,'reset_parent_pin') then raise exception 'Foreign consume'; end if;
  if public.consume_sensitive_action(a,request.id,'delete_account') then raise exception 'Wrong purpose accepted'; end if;
  if public.reset_parent_pin_with_proof(b,request.id,'5678') then raise exception 'Foreign reset'; end if;
  update public.parent_pin_credentials set failed_attempts=5,locked_until=pg_catalog.now()+interval '5 minutes'
    where parent_id=(select id from public.profiles where auth_user_id=a);
  if not public.reset_parent_pin_with_proof(a,request.id,'5678') then raise exception 'Reset after wait failed'; end if;
  if public.reset_parent_pin_with_proof(a,request.id,'9999') then raise exception 'Replay accepted'; end if;
  select pin_hash into stored from public.parent_pin_credentials where parent_id=(select id from public.profiles where auth_user_id=a);
  if stored = '5678' or stored not like '$2a$12$%' or extensions.crypt('5678',stored) <> stored then raise exception 'Hash mismatch'; end if;
  if exists (select 1 from public.parent_pin_credentials where parent_id=(select id from public.profiles where auth_user_id=a)
    and (failed_attempts<>0 or locked_until is not null)) then raise exception 'Lock not reset'; end if;
  perform pg_catalog.set_config('request.jwt.claim.sub', a::text, true);
  if public.verify_parent_pin('1234') is distinct from false then raise exception 'Old PIN accepted'; end if;
  if public.verify_parent_pin('5678') is distinct from true then raise exception 'New PIN rejected'; end if;
  perform pg_catalog.set_config('request.jwt.claim.sub', b::text, true);
  if public.verify_parent_pin('1234') is distinct from true then raise exception 'Other credential changed'; end if;

  update public.sensitive_action_challenges set created_at=created_at-interval '1 minute' where user_id=a;
  request := public.request_sensitive_action(a,'delete_account');
  if request.available_at < request.created_at + interval '13 days'
    or request.available_at > request.created_at + interval '15 days' then raise exception 'Deletion window wrong'; end if;
  perform public.cancel_sensitive_action(a,request.id);
  if public.consume_sensitive_action(a,request.id,'delete_account') then raise exception 'Cancelled consumed'; end if;
  update public.sensitive_action_challenges set created_at=created_at-interval '1 minute' where user_id=a;
  request := public.request_sensitive_action(a,'delete_account');
  update public.sensitive_action_challenges
    set created_at=pg_catalog.clock_timestamp()-interval '15 days',
        available_at=pg_catalog.clock_timestamp()-interval '2 seconds',
        expires_at=pg_catalog.clock_timestamp()-interval '1 second'
    where id=request.id;
  if public.consume_sensitive_action(a,request.id,'delete_account') then raise exception 'Expired consumed'; end if;

  -- A deletion operation may only be prepared once the waiting period has elapsed.
  update public.sensitive_action_challenges set created_at=created_at-interval '1 minute' where user_id=a;
  request := public.request_sensitive_action(a,'delete_account');
  begin
    perform public.prepare_account_deletion(a,request.id,pg_catalog.repeat('a',64));
    raise exception 'Prepared while waiting';
  exception when others then
    if sqlerrm <> 'Waiting period required' then raise; end if;
  end;
  update public.sensitive_action_challenges
    set created_at=pg_catalog.clock_timestamp()-interval '15 days',
        available_at=pg_catalog.clock_timestamp()-interval '1 second'
    where id=request.id;
  perform public.prepare_account_deletion(a,request.id,pg_catalog.repeat('a',64));

  -- The banner projection is scoped to the caller only.
  perform pg_catalog.set_config('request.jwt.claim.sub', b::text, true);
  select count(*) into rows from public.list_pending_sensitive_actions();
  if rows <> 0 then raise exception 'Projection leaked another account'; end if;
  perform pg_catalog.set_config('request.jwt.claim.sub', a::text, true);
  select count(*) into rows from public.list_pending_sensitive_actions();
  if rows <> 1 then raise exception 'Projection missed own request'; end if;

  -- Scheduled purge: an elapsed deletion must complete even if the owner never returns.
  if public.count_due_account_deletions() <> 1 then raise exception 'Due count wrong'; end if;
  claimed := public.claim_due_account_deletion();
  if claimed is distinct from a then raise exception 'Due deletion not claimed'; end if;
  -- Claiming must not consume: an Admin failure has to stay retryable inside the window.
  if not exists (select 1 from public.sensitive_action_challenges where id=request.id and status='pending') then
    raise exception 'Claim consumed the request';
  end if;
  if public.claim_due_account_deletion() is not null then raise exception 'Claim ignored its backoff'; end if;
  update public.sensitive_action_challenges
    set purge_claimed_at=pg_catalog.clock_timestamp()-interval '2 hours' where id=request.id;
  if public.claim_due_account_deletion() is distinct from a then raise exception 'Retry after backoff failed'; end if;
  begin
    perform public.claim_due_account_deletion(interval '30 seconds');
    raise exception 'Tiny backoff accepted';
  exception when sqlstate '22023' then null;
  end;
  perform public.cancel_sensitive_action(a,request.id);
  if public.claim_due_account_deletion() is not null then raise exception 'Cancelled request claimed'; end if;
  if public.count_due_account_deletions() <> 0 then raise exception 'Cancelled request counted'; end if;

  update public.sensitive_action_challenges set created_at=created_at-interval '1 minute' where user_id=a;
  request := public.request_sensitive_action(a,'delete_account');
  if public.claim_due_account_deletion() is not null then raise exception 'Waiting request claimed'; end if;
  if public.count_due_account_deletions() <> 0 then raise exception 'Waiting request counted'; end if;
  -- Past its window the job must lapse the request rather than delete late.
  update public.sensitive_action_challenges
    set created_at=pg_catalog.clock_timestamp()-interval '22 days',
        available_at=pg_catalog.clock_timestamp()-interval '8 days',
        expires_at=pg_catalog.clock_timestamp()-interval '1 second'
    where id=request.id;
  if public.claim_due_account_deletion() is not null then raise exception 'Expired request claimed'; end if;
  if public.count_due_account_deletions() <> 0 then raise exception 'Expired request counted'; end if;

  -- Exercise the real preexisting FK graph, including plans/tasks and collectible growth events.
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
