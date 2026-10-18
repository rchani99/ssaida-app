-- Isolated fixtures in a rolled-back transaction; safe on local or approved DEV.
begin;
do $$
declare u uuid := gen_random_uuid(); v uuid := gen_random_uuid(); r uuid := gen_random_uuid();
begin
  insert into auth.users(id) values(u),(v),(r);
  perform set_config('request.jwt.claim.sub',u::text,true);
  perform set_config('test.other_user',v::text,true);
  perform set_config('test.rest_user',r::text,true);
  assert not has_function_privilege('anon','public.create_study_item(uuid,jsonb,boolean)','EXECUTE');
  assert has_function_privilege('authenticated','public.create_study_item(uuid,jsonb,boolean)','EXECUTE');
  assert (select prosecdef and 'search_path=""'=any(proconfig) from pg_proc
    where oid='public.create_study_item(uuid,jsonb,boolean)'::regprocedure);
end $$;
set local role authenticated;
do $$
declare
  c uuid; c2 uuid; cr uuid; p uuid; p2 uuid; pr uuid; future uuid;
  unchecked public.study_items; book public.study_items; activity public.study_items;
  other_day public.study_items; rest_item public.study_items;
  today date := (statement_timestamp() at time zone 'Asia/Seoul')::date;
  weekday smallint := extract(isodow from today)::smallint;
  owner text := auth.uid()::text;
  values_json jsonb := jsonb_build_object('item_type','ACTIVITY','name','Activity',
    'estimated_minutes',15,'study_weekdays',jsonb_build_array(weekday));
  previous_tasks jsonb; previous_plan jsonb; item_count integer; task_id uuid;
begin
  perform public.complete_parent_onboarding('Apply today test',60,'1234');
  select id into c from public.children;
  update public.children set rest_weekdays='{}'::smallint[] where id=c;
  assert not exists(select 1 from public.daily_plans where child_id=c and plan_date=today);

  -- Unchecked registration freezes an initially absent today plan, but becomes
  -- eligible on future matching dates.
  select * into unchecked from public.create_study_item(c, values_json, false);
  p := public.ensure_daily_plan(c,today);
  assert not exists(select 1 from public.daily_tasks where daily_plan_id=p);
  perform public.ensure_daily_plan(c,today);
  assert not exists(select 1 from public.daily_tasks where daily_plan_id=p);
  select to_jsonb(dp) into previous_plan from public.daily_plans dp where id=p;

  select * into book from public.create_study_item(c, jsonb_build_object(
    'item_type','WORKBOOK','name','Book','subject','MATH','estimated_minutes',20,
    'study_weekdays',jsonb_build_array(weekday),'workbook_pages_per_session',5,
    'workbook_last_page',100,'workbook_next_start_page',98), true);
  select id into task_id from public.daily_tasks where daily_plan_id=p and study_item_id=book.id;
  assert task_id is not null;
  assert (select source_type='AUTO' and planned_start_page=98 and planned_end_page=100
    and planned_minutes=20 and name_snapshot='Book' and subject_snapshot='MATH'
    and planning_revision is not distinct from book.planning_revision
    from public.daily_tasks where id=task_id);
  perform public.exclude_daily_task(task_id,(select updated_at from public.daily_tasks where id=task_id));
  select jsonb_agg(to_jsonb(dt) order by sort_order) into previous_tasks
    from public.daily_tasks dt where daily_plan_id=p;

  select * into activity from public.create_study_item(c,values_json,true);
  assert (select source_type='AUTO' and planned_start_page is null and planned_end_page is null
    and planned_minutes=15 and sort_order=1 from public.daily_tasks
    where daily_plan_id=p and study_item_id=activity.id);
  assert previous_tasks=(select jsonb_agg(to_jsonb(dt) order by sort_order) from public.daily_tasks dt
    where daily_plan_id=p and study_item_id<>activity.id), 'Existing tasks changed';
  assert previous_plan=(select to_jsonb(dp) from public.daily_plans dp where id=p), 'Plan snapshot changed';
  perform public.ensure_daily_plan(c,today);
  assert (select count(*)=2 from public.daily_tasks where daily_plan_id=p), 'Duplicate task';

  select * into other_day from public.create_study_item(c,
    values_json || jsonb_build_object('study_weekdays',jsonb_build_array(weekday % 7 + 1)),true);
  assert not exists(select 1 from public.daily_tasks where study_item_id=other_day.id);
  future := public.ensure_daily_plan(c,today+7);
  assert exists(select 1 from public.daily_tasks where daily_plan_id=future and study_item_id=unchecked.id);

  -- Invalid registration rolls back without a partial item or task.
  select count(*) into item_count from public.study_items where child_id=c;
  begin
    perform public.create_study_item(c,jsonb_build_object('item_type','WORKBOOK','name','Invalid',
      'estimated_minutes',20,'study_weekdays',jsonb_build_array(weekday),
      'workbook_pages_per_session',5,'workbook_last_page',10,'workbook_next_start_page',11),true);
    raise exception 'Invalid workbook accepted';
  exception when invalid_parameter_value then null; end;
  assert item_count=(select count(*) from public.study_items where child_id=c);

  update public.children set rest_weekdays=array[weekday] where id=c;
  select * into rest_item from public.create_study_item(c,values_json,true);
  assert not exists(select 1 from public.daily_tasks where study_item_id=rest_item.id), 'Current rest day ignored';

  perform set_config('request.jwt.claim.sub',current_setting('test.other_user'),true);
  begin
    perform public.create_study_item(c,values_json,true);
    raise exception 'Another owner accepted';
  exception when insufficient_privilege then null; end;
  perform public.complete_parent_onboarding('Fresh plan test',60,'1234');
  select id into c2 from public.children;
  update public.children set rest_weekdays='{}'::smallint[] where id=c2;
  select * into activity from public.create_study_item(c2,values_json,true);
  p2 := public.ensure_daily_plan(c2,today);
  assert (select count(*)=1 from public.daily_tasks where daily_plan_id=p2), 'Fresh plan duplicate or missing task';

  perform set_config('request.jwt.claim.sub',current_setting('test.rest_user'),true);
  perform public.complete_parent_onboarding('Rest plan test',60,'1234');
  select id into cr from public.children;
  update public.children set rest_weekdays=array[weekday] where id=cr;
  select * into rest_item from public.create_study_item(cr,values_json,true);
  pr := public.ensure_daily_plan(cr,today);
  assert (select day_type='REST' from public.daily_plans where id=pr);
  assert not exists(select 1 from public.daily_tasks where daily_plan_id=pr);
  update public.children set rest_weekdays='{}'::smallint[] where id=cr;
  select * into rest_item from public.create_study_item(cr,values_json,true);
  assert not exists(select 1 from public.daily_tasks where daily_plan_id=pr), 'Frozen rest plan changed';

  perform set_config('request.jwt.claim.sub','',true);
  begin
    perform public.create_study_item(c,values_json,true);
    raise exception 'Missing auth accepted';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub',owner,true);
end $$;
reset role;
select 'PASS: apply today, weekdays, rest days, frozen plans, linkage, bounds, ownership, rollback' as result;
rollback;
