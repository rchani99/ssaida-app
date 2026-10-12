-- Run in a rollback transaction; fixtures and simulated rewards never persist.
update public.collectible_catalog set is_active = false;
insert into public.collectible_catalog(theme_code, code, name, growth_goal, sort_order)
values ('DINO', 'SWITCH_TEST_D1', 'D1', 10, 1),
       ('DINO', 'SWITCH_TEST_D2', 'D2', 10, 2),
       ('GEM', 'SWITCH_TEST_G1', 'G1', 12, 1);

do $$
declare owner_id uuid := gen_random_uuid(); other_id uuid := gen_random_uuid();
begin
  insert into auth.users(id) values (owner_id), (other_id);
  perform set_config('request.jwt.claim.sub', owner_id::text, true);
  perform set_config('test.owner', owner_id::text, true);
  perform set_config('test.other', other_id::text, true);
  assert (select prosecdef and 'search_path=""' = any(proconfig) from pg_proc
    where oid = 'public.select_collection_theme(text)'::regprocedure);
  assert has_function_privilege('authenticated', 'public.select_collection_theme(text)', 'EXECUTE');
  assert not has_function_privilege('anon', 'public.select_collection_theme(text)', 'EXECUTE');
  assert not has_function_privilege('service_role', 'public.select_collection_theme(text)', 'EXECUTE');
end $$;

set local role authenticated;
do $$
declare c uuid; dino uuid; gem uuid; task uuid;
  today date := timezone('Asia/Seoul', clock_timestamp())::date;
begin
  perform public.complete_parent_onboarding('Theme switch test', 60, '1234');
  select id into strict c from public.children;
  perform set_config('test.child', c::text, true);
  perform public.select_collection_theme('DINO');
  select id into strict dino from public.child_collectibles where child_id = c;
  perform set_config('test.dino', dino::text, true);
  perform public.select_collection_theme('DINO');
  assert (select count(*) = 1 from public.child_collectibles where child_id = c);

  -- A completed task keeps its reward theme when the garden theme changes.
  task := public.add_manual_daily_task(c, today, 'ACTIVITY', 'Switch reward', null, null, null, 5::smallint);
  perform public.start_daily_task(task);
  perform public.complete_daily_task(task);
  perform public.select_collection_theme('GEM');
  select id into strict gem from public.child_collectibles where child_id = c and theme_code = 'GEM';
  perform set_config('test.gem', gem::text, true);
  perform public.confirm_daily_tasks(jsonb_build_array(jsonb_build_object(
    'daily_task_id', task, 'status', 'PARENT_CONFIRMED', 'actual_end_page', null)));
  perform public.confirm_daily_tasks(jsonb_build_array(jsonb_build_object(
    'daily_task_id', task, 'status', 'PARENT_CONFIRMED', 'actual_end_page', null)));
  assert (select reward_collection_theme_code = 'DINO' from public.daily_tasks where id = task);
  assert (select progress_points = 1 from public.child_collectibles where id = dino);
  assert (select progress_points = 0 from public.child_collectibles where id = gem);
  perform public.select_collection_theme('DINO');
  assert (select selected_collection_theme_code = 'DINO' from public.children where id = c);
  assert (select progress_points = 1 and status = 'GROWING' from public.child_collectibles where id = dino);
  assert (select count(*) = 2 from public.child_collectibles where child_id = c);

  begin
    perform public.select_collection_theme('UNKNOWN');
    raise exception 'Unknown theme accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.select_collection_theme('ROBOT');
    raise exception 'Empty target accepted';
  exception when invalid_parameter_value then null;
  end;
  assert (select selected_collection_theme_code = 'DINO' from public.children where id = c);
  perform set_config('request.jwt.claim.sub', current_setting('test.other'), true);
  assert not exists(select 1 from public.children where id = c);
  begin
    perform public.select_collection_theme('GEM');
    raise exception 'Foreign child accepted';
  exception when insufficient_privilege then null;
  end;
  perform set_config('request.jwt.claim.sub', current_setting('test.owner'), true);
end $$;
reset role;

-- Switching away from an unrevealed completion preserves it. Pending points
-- apply once to the selected theme; they never move existing item progress.
update public.child_collectibles set progress_points = growth_goal_snapshot,
  status = 'COMPLETED', completed_at = now()
where id = current_setting('test.dino')::uuid;
update public.children set pending_growth_points = 3 where id = current_setting('test.child')::uuid;
set local role authenticated;
do $$
declare c uuid := current_setting('test.child')::uuid;
  dino uuid := current_setting('test.dino')::uuid;
  gem uuid := current_setting('test.gem')::uuid;
begin
  perform public.select_collection_theme('GEM');
  assert (select progress_points = 3 and status = 'GROWING' from public.child_collectibles where id = gem);
  assert (select pending_growth_points = 0 from public.children where id = c);
  perform public.select_collection_theme('DINO');
  assert (select status = 'COMPLETED' and progress_points = 10 and revealed_at is null
    from public.child_collectibles where id = dino);
  perform public.select_collection_theme('GEM');
  assert (select progress_points = 3 from public.child_collectibles where id = gem);
  assert (select count(*) = 2 from public.child_collectibles where child_id = c);
  assert (select count(*) = 1 from public.collectible_growth_events
    where child_collectible_id = gem and source_type = 'PENDING_APPLY');
  perform public.select_collection_theme('DINO');
  perform public.reveal_collectible(dino);
  perform public.reveal_collectible(dino);
  assert (select count(*) = 3 from public.child_collectibles where child_id = c);
  assert (select count(*) = 1 from public.child_collectibles
    where child_id = c and theme_code = 'DINO' and status = 'GROWING');
end $$;
reset role;

-- An inactive/empty previous catalog cannot trap the child in that theme.
update public.collectible_catalog set is_active = false where code like 'SWITCH_TEST_D%';
set local role authenticated;
do $$ begin
  perform public.select_collection_theme('GEM');
  assert (select selected_collection_theme_code = 'GEM' from public.children
    where id = current_setting('test.child')::uuid);
end $$;
reset role;
