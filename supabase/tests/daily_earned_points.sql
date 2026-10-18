-- Isolated fixtures only; always roll back. Requires the daily-points migration.
begin;
do $$
declare u uuid := gen_random_uuid();
begin
  insert into auth.users(id) values(u);
  perform set_config('request.jwt.claim.sub',u::text,true);
  assert not has_column_privilege('authenticated','public.daily_tasks','awarded_growth_points','UPDATE');
  assert has_column_privilege('authenticated','public.daily_tasks','awarded_growth_points','SELECT');
end $$;
set local role authenticated;
do $$
declare c uuid; p uuid; task uuid; retry_task uuid; book public.study_items;
  today date := (statement_timestamp() at time zone 'Asia/Seoul')::date;
  confirmation jsonb; before_points numeric; stamp timestamptz;
begin
  perform public.complete_parent_onboarding('Points test',60,'1234');
  select id into c from public.children;
  perform set_config('test.points_child',c::text,true);
  update public.children set rest_weekdays='{}'::smallint[] where id=c;
  select * into book from public.create_study_item(c,jsonb_build_object(
    'item_type','WORKBOOK','name','Partial book','estimated_minutes',20,
    'study_weekdays',jsonb_build_array(extract(isodow from today)),
    'workbook_pages_per_session',5,'workbook_last_page',100,'workbook_next_start_page',1),true);
  p := public.ensure_daily_plan(c,today);
  select id into task from public.daily_tasks where daily_plan_id=p and study_item_id=book.id;
  assert (select awarded_growth_points is null from public.daily_tasks where id=task);
  perform public.start_daily_task(task);
  perform public.complete_daily_task(task);
  assert (select awarded_growth_points is null from public.daily_tasks where id=task), 'Pending is not awarded';
  select pending_growth_points into before_points from public.children where id=c;
  confirmation := jsonb_build_array(jsonb_build_object('daily_task_id',task,'status','PARTIAL','actual_end_page',3));
  perform public.confirm_daily_tasks(confirmation);
  assert (select awarded_growth_points=0.6 from public.daily_tasks where id=task), 'Partial amount';
  assert (select pending_growth_points=before_points+0.6 from public.children where id=c), 'Pending wallet included';
  select parent_verified_at into stamp from public.daily_tasks where id=task;
  perform public.confirm_daily_tasks(confirmation);
  assert (select awarded_growth_points=0.6 and parent_verified_at=stamp from public.daily_tasks where id=task), 'Repeat confirmation changed reward';

  retry_task := public.add_manual_daily_task(c,today,'ACTIVITY','Retry activity',null,null,null,10::smallint);
  perform public.start_daily_task(retry_task); perform public.complete_daily_task(retry_task);
  perform public.confirm_daily_tasks(jsonb_build_array(jsonb_build_object('daily_task_id',retry_task,'status','RETRY','actual_end_page',null)));
  assert (select awarded_growth_points=0 from public.daily_tasks where id=retry_task);
  perform public.start_daily_task(retry_task); perform public.complete_daily_task(retry_task);
  perform public.confirm_daily_tasks(jsonb_build_array(jsonb_build_object('daily_task_id',retry_task,'status','PARENT_CONFIRMED','actual_end_page',null)));
  assert (select awarded_growth_points=growth_weight from public.daily_tasks where id=retry_task), 'Final retry reward';

  -- A later plan may be confirmed today; count by confirmation time, not plan date.
  task := public.add_manual_daily_task(c,today-1,'ACTIVITY','Yesterday activity',null,null,null,10::smallint);
  perform public.start_daily_task(task); perform public.complete_daily_task(task);
  perform public.confirm_daily_tasks(jsonb_build_array(jsonb_build_object('daily_task_id',task,'status','PARENT_CONFIRMED','actual_end_page',null)));
  assert (select awarded_growth_points=growth_weight and (parent_verified_at at time zone 'Asia/Seoul')::date=today from public.daily_tasks where id=task);
  perform public.select_collection_theme('DINO');
end $$;
reset role;
-- Force only this test child's collectible near completion to exercise overflow.
update public.child_collectibles set progress_points=growth_goal_snapshot-0.01
where child_id=current_setting('test.points_child')::uuid and status='GROWING';
set local role authenticated;
do $$
declare c uuid:=current_setting('test.points_child')::uuid; task uuid; weight numeric;
  today date := (statement_timestamp() at time zone 'Asia/Seoul')::date;
  before_pending numeric;
begin
  select pending_growth_points into before_pending from public.children where id=c;
  task := public.add_manual_daily_task(c,today,'ACTIVITY','Overflow activity',null,null,null,10::smallint);
  perform public.start_daily_task(task); perform public.complete_daily_task(task);
  select growth_weight into weight from public.daily_tasks where id=task;
  perform public.confirm_daily_tasks(jsonb_build_array(jsonb_build_object('daily_task_id',task,'status','PARENT_CONFIRMED','actual_end_page',null)));
  assert (select awarded_growth_points=weight from public.daily_tasks where id=task), 'Overflow must count entire award';
  assert (select pending_growth_points=before_pending+weight-0.01 from public.children where id=c);
  assert (select sum(growth_points)=0.01 from public.collectible_growth_events where daily_task_id=task);

  task := public.add_manual_daily_task(c,today,'ACTIVITY','Waiting collectible',null,null,null,10::smallint);
  perform public.start_daily_task(task); perform public.complete_daily_task(task);
  perform public.confirm_daily_tasks(jsonb_build_array(jsonb_build_object('daily_task_id',task,'status','PARENT_CONFIRMED','actual_end_page',null)));
  assert (select awarded_growth_points=growth_weight from public.daily_tasks where id=task), 'Unrevealed collectible still earns points';
end $$;
reset role;
select 'PASS: exact awards, partial, retry, idempotence, confirmation date, pending wallet, overflow, write permissions' as result;
rollback;
