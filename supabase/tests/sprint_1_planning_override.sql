-- Run only against local Supabase. All fixtures roll back, including auth users.
begin;
do $$
declare u uuid := pg_catalog.gen_random_uuid(); v uuid := pg_catalog.gen_random_uuid();
begin
  insert into auth.users(id) values(u), (v);
  perform pg_catalog.set_config('request.jwt.claim.sub', u::text, true);
  perform pg_catalog.set_config('test.other_user', v::text, true);
  assert not pg_catalog.has_function_privilege('anon', 'public.update_study_item(uuid,timestamptz,jsonb)', 'EXECUTE');
  assert pg_catalog.has_function_privilege('authenticated', 'public.update_study_item(uuid,timestamptz,jsonb)', 'EXECUTE');
  assert (select prosecdef and 'search_path=""' = any(proconfig) from pg_catalog.pg_proc where oid = 'public.update_study_item(uuid,timestamptz,jsonb)'::regprocedure);
end $$;
set local role authenticated;
do $$
declare
  child uuid;
  item uuid;
  new_workbook uuid;
  new_activity uuid;
  plan uuid;
  task1 uuid;
  task2 uuid;
  task3 uuid;
  task8 uuid;
  task9 uuid;
  task10 uuid;
  source_id uuid;
  revision timestamptz;
  generation uuid;
  original_user text := auth.uid()::text;
  before_growth numeric;
  next_plan uuid;
  row_task record;
  task_count integer;
begin
  perform public.complete_parent_onboarding('Sprint1 SQL', 60, '1234');
  select id into child from public.children;
  plan := public.ensure_daily_plan(child, '2030-01-01');
  insert into public.study_items(child_id,item_type,name,estimated_minutes,study_weekdays,workbook_pages_per_session,workbook_last_page,workbook_last_completed_page)
  values(child,'WORKBOOK','Existing',20,array[1,2,3,4,5,6,7]::smallint[],5,100,27) returning id into item;
  perform public.ensure_daily_plan(child, '2030-01-01');
  assert (select count(*) = 0 from public.daily_tasks where daily_plan_id = plan), 'empty plans freeze too';

  plan := public.ensure_daily_plan(child, '2030-01-02');
  select id into task1 from public.daily_tasks where daily_plan_id = plan and study_item_id = item;
  assert (select planned_start_page = 28 and planned_end_page = 32 from public.daily_tasks where id = task1);
  select updated_at into revision from public.study_items where id = item;
  perform public.update_study_item(item, revision, '{"next_start_page":40}'::jsonb);
  select updated_at into revision from public.study_items where id = item;
  perform public.update_study_item(item, revision, '{"name":"Renamed"}'::jsonb);
  assert (select workbook_last_completed_page = 27 and workbook_next_start_page_override = 40 from public.study_items where id = item);
  assert (select planned_start_page = 28 and planned_end_page = 32 from public.daily_tasks where id = task1), 'edit preserves snapshots';

  insert into public.study_items(child_id,item_type,name,estimated_minutes,study_weekdays,workbook_pages_per_session,workbook_last_page,workbook_last_completed_page)
  values(child,'WORKBOOK','New workbook',20,array[1,2,3,4,5,6,7]::smallint[],5,100,0) returning id into new_workbook;
  insert into public.study_items(child_id,item_type,name,estimated_minutes,study_weekdays)
  values(child,'ACTIVITY','New activity',20,array[1,2,3,4,5,6,7]::smallint[]) returning id into new_activity;
  perform public.ensure_daily_plan(child, '2030-01-02');
  perform public.add_manual_daily_task(child,'2030-01-02','ACTIVITY','Manual',null,null,null,10::smallint);
  source_id := public.add_manual_daily_task(child,'2030-01-01','ACTIVITY','Old manual',null,null,null,10::smallint);
  perform public.reschedule_manual_task(source_id, '2030-01-02');
  assert (select count(*) = 0 from public.daily_tasks where daily_plan_id = plan and study_item_id in (new_workbook,new_activity)), 'manual/reschedule cannot backfill AUTO';
  assert (select count(*) = 2 from public.daily_tasks where daily_plan_id = plan and source_type in ('MANUAL','RESCHEDULED'));

  next_plan := public.ensure_daily_plan(child, '2030-01-03');
  select id into task2 from public.daily_tasks where daily_plan_id = next_plan and study_item_id = item;
  assert (select count(*) = 2 from public.daily_tasks where daily_plan_id = next_plan and study_item_id in (new_workbook,new_activity));
  assert (select planned_start_page = 40 and planned_end_page = 44 from public.daily_tasks where id = task2);
  assert (select workbook_last_completed_page = 27 and workbook_next_start_page_override = 40 from public.study_items where id = item);
  perform public.ensure_daily_plan(child, '2030-01-03');
  assert (select count(*) = 1 from public.daily_tasks where daily_plan_id = next_plan and study_item_id = item);
  next_plan := public.ensure_daily_plan(child, '2030-01-04');
  select id into task3 from public.daily_tasks where daily_plan_id = next_plan and study_item_id = item;
  assert (select planned_start_page = 40 from public.daily_tasks where id = task3), 'miss does not consume override';

  perform public.start_daily_task(task2);
  next_plan := public.ensure_daily_plan(child, '2030-01-05');
  assert not exists(select 1 from public.daily_tasks where daily_plan_id = next_plan and study_item_id = item), 'in progress protection';
  perform public.complete_daily_task(task2);
  next_plan := public.ensure_daily_plan(child, '2030-01-06');
  assert (select planned_start_page = 45 from public.daily_tasks where daily_plan_id = next_plan and study_item_id = item), 'provisional uses current generation';
  perform public.confirm_daily_tasks(pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('daily_task_id',task2,'status','RETRY','actual_end_page',null)));
  assert (select workbook_next_start_page_override = 40 and workbook_last_completed_page = 27 from public.study_items where id = item);
  next_plan := public.ensure_daily_plan(child, '2030-01-07');
  assert not exists(select 1 from public.daily_tasks where daily_plan_id = next_plan and study_item_id = item), 'retry protection';
  perform public.start_daily_task(task2);
  perform public.complete_daily_task(task2);
  perform public.confirm_daily_tasks(pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('daily_task_id',task2,'status','PARTIAL','actual_end_page',42)));
  assert (select workbook_next_start_page_override is null and workbook_last_completed_page = 42 from public.study_items where id = item);
  assert (select planned_start_page = 43 and planned_end_page = 47 from public.daily_tasks where id = task3), 'partial recalculation preserved';
  assert (select planned_start_page = 28 and status = 'PLANNED' from public.daily_tasks where id = task1), 'past history preserved';

  perform public.start_daily_task(task3);
  perform public.complete_daily_task(task3);
  select updated_at into revision from public.study_items where id = item;
  perform public.update_study_item(item, revision, '{"next_start_page":70}');
  next_plan := public.ensure_daily_plan(child, '2030-01-08');
  select id into task8 from public.daily_tasks where daily_plan_id = next_plan and study_item_id = item;
  assert (select planned_start_page = 70 from public.daily_tasks where id = task8);
  perform public.confirm_daily_tasks(pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('daily_task_id',task3,'status','PARENT_CONFIRMED','actual_end_page',47)));
  assert (select workbook_next_start_page_override = 70 and workbook_last_completed_page = 47 from public.study_items where id = item), 'old confirmation cannot consume new override';
  assert (select planned_start_page = 70 from public.daily_tasks where id = task8), 'old confirmation cannot recalculate new generation';

  perform public.start_daily_task(task8);
  perform public.complete_daily_task(task8);
  select updated_at, planning_revision into revision, generation from public.study_items where id = item;
  perform public.update_study_item(item, revision, '{"next_start_page":70}');
  assert (select planning_revision <> generation from public.study_items where id = item), 'same value is a new edit generation';
  perform public.confirm_daily_tasks(pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('daily_task_id',task8,'status','PARENT_CONFIRMED','actual_end_page',74)));
  assert (select workbook_next_start_page_override = 70 and workbook_last_completed_page = 74 from public.study_items where id = item);
  next_plan := public.ensure_daily_plan(child, '2030-01-09');
  select id into task9 from public.daily_tasks where daily_plan_id = next_plan and study_item_id = item;
  assert (select planned_start_page = 70 from public.daily_tasks where id = task9), 'override takes precedence over confirmed progress';
  select pending_growth_points into before_growth from public.children where id = child;
  perform public.start_daily_task(task9);
  perform public.complete_daily_task(task9);
  perform public.confirm_daily_tasks(pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('daily_task_id',task9,'status','PARENT_CONFIRMED','actual_end_page',74)));
  assert (select workbook_next_start_page_override is null and workbook_last_completed_page = 74 from public.study_items where id = item);
  assert (select pending_growth_points = before_growth from public.children where id = child), 'repeat pages do not reward twice';

  next_plan := public.ensure_daily_plan(child, '2030-01-10');
  select id into task10 from public.daily_tasks where daily_plan_id = next_plan and study_item_id = item;
  assert (select planned_start_page = 75 from public.daily_tasks where id = task10);
  next_plan := public.ensure_daily_plan(child, '2030-01-11');
  perform public.start_daily_task(task10);
  perform public.complete_daily_task(task10);
  perform public.confirm_daily_tasks(pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('daily_task_id',task10,'status','PARENT_CONFIRMED','actual_end_page',100)));
  assert (select status = 'COMPLETED' and workbook_last_completed_page = 100 from public.study_items where id = item);
  assert not exists(select 1 from public.daily_tasks where daily_plan_id = next_plan and study_item_id = item);
  assert exists(select 1 from public.daily_plans where id = next_plan), 'container preserved';

  -- Invalid bounds, ACTIVITY override, stale edit, ownership and direct-write denial.
  select updated_at into revision from public.study_items where id = new_workbook;
  begin perform public.update_study_item(new_workbook, revision, '{"next_start_page":0}'); raise exception 'zero accepted'; exception when sqlstate '22023' then null; end;
  begin perform public.update_study_item(new_workbook, revision, '{"next_start_page":101}'); raise exception 'overflow accepted'; exception when sqlstate '22023' then null; end;
  begin perform public.update_study_item(new_workbook, revision - interval '1 second', '{"name":"stale"}'); raise exception 'stale accepted'; exception when sqlstate '40001' then null; end;
  select updated_at into revision from public.study_items where id = new_activity;
  begin perform public.update_study_item(new_activity, revision, '{"next_start_page":1}'); raise exception 'activity accepted'; exception when sqlstate '22023' then null; end;
  begin update public.study_items set workbook_next_start_page_override = 5 where id = new_workbook; raise exception 'direct update accepted'; exception when insufficient_privilege then null; end;
  perform pg_catalog.set_config('request.jwt.claim.sub', pg_catalog.current_setting('test.other_user'), true);
  begin perform public.update_study_item(new_workbook, revision, '{"next_start_page":5}'); raise exception 'foreign edit accepted'; exception when insufficient_privilege then null; end;
  begin perform public.ensure_daily_plan(child, '2030-01-12'); raise exception 'foreign plan accepted'; exception when insufficient_privilege then null; end;
  assert not exists(select 1 from public.study_items where id = new_workbook), 'RLS owner select';
  perform pg_catalog.set_config('request.jwt.claim.sub', original_user, true);
  update public.children set rest_weekdays = array[1,2,3,4,5,6,7]::smallint[] where id = child;
  next_plan := public.ensure_daily_plan(child, '2030-01-12');
  assert (select day_type = 'REST' from public.daily_plans where id = next_plan);
  update public.children set rest_weekdays = '{}'::smallint[] where id = child;
  perform public.ensure_daily_plan(child, '2030-01-12');
  assert not exists(select 1 from public.daily_tasks where daily_plan_id = next_plan);
  perform public.add_manual_daily_task(child,'2030-01-12','ACTIVITY','Rest manual',null,null,null,10::smallint);
  assert (select count(*) = 1 from public.daily_tasks where daily_plan_id = next_plan);
  -- Even a fully parent-confirmed day cannot gain new AUTO tasks after registration.
  next_plan := public.ensure_daily_plan(child, '2030-01-13');
  for row_task in select * from public.daily_tasks where daily_plan_id = next_plan loop
    perform public.start_daily_task(row_task.id);
    perform public.complete_daily_task(row_task.id);
    perform public.confirm_daily_tasks(pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'daily_task_id',row_task.id,'status','PARENT_CONFIRMED','actual_end_page',row_task.planned_end_page)));
  end loop;
  select count(*) into task_count from public.daily_tasks where daily_plan_id = next_plan;
  assert task_count > 0;
  insert into public.study_items(child_id,item_type,name,estimated_minutes,study_weekdays)
  values(child,'ACTIVITY','After all done',20,array[1,2,3,4,5,6,7]::smallint[]) returning id into new_activity;
  perform public.ensure_daily_plan(child, '2030-01-13');
  assert (select count(*) = task_count from public.daily_tasks where daily_plan_id = next_plan);
  assert not exists(select 1 from public.daily_tasks where daily_plan_id = next_plan and status <> 'PARENT_CONFIRMED');
  plan := public.ensure_daily_plan(child, '2030-01-14');
  assert exists(select 1 from public.daily_tasks where daily_plan_id = plan and study_item_id = new_activity);
  raise notice 'Sprint 1 DB regression PASS: frozen plans, override lifecycle, partial/retry, revisions, progress/rewards, RLS and permissions';
end $$;
rollback;
