-- Local-only regression. Every fixture is rolled back.
begin;
do $$
declare u uuid := pg_catalog.gen_random_uuid(); v uuid := pg_catalog.gen_random_uuid();
begin
 insert into auth.users(id) values(u),(v);
 perform pg_catalog.set_config('request.jwt.claim.sub',u::text,true);
 perform pg_catalog.set_config('test.other_user',v::text,true);
 assert not pg_catalog.has_function_privilege('anon','public.reorder_daily_tasks(uuid,jsonb)','EXECUTE');
 assert pg_catalog.has_function_privilege('authenticated','public.reorder_daily_tasks(uuid,jsonb)','EXECUTE');
 assert (select prosecdef and 'search_path=""'=any(proconfig) from pg_catalog.pg_proc where oid='public.reorder_daily_tasks(uuid,jsonb)'::regprocedure);
 assert not exists(select 1 from pg_catalog.pg_proc p, lateral pg_catalog.aclexplode(p.proacl) a where p.oid='public.reorder_daily_tasks(uuid,jsonb)'::regprocedure and a.grantee=0 and a.privilege_type='EXECUTE');
end $$;
set local role authenticated;
do $$
declare
 child uuid; plan uuid; past_plan uuid; other_task uuid; a uuid; b uuid; item uuid;
 today date := pg_catalog.timezone('Asia/Seoul',pg_catalog.clock_timestamp())::date;
 payload jsonb; old_payload jsonb; before_tasks jsonb; before_items jsonb; before_child jsonb;
 unchanged jsonb; original_user text := auth.uid()::text; extra uuid; state text;
begin
 perform public.complete_parent_onboarding('Sprint2 order',60,'1234');
 select id into child from public.children;
 insert into public.study_items(child_id,item_type,name,estimated_minutes,study_weekdays,workbook_pages_per_session,workbook_last_page,workbook_last_completed_page)
 values(child,'WORKBOOK','Auto',20,array[1,2,3,4,5,6,7]::smallint[],5,100,0) returning id into item;
 plan := public.ensure_daily_plan(child,today);
 select id into a from public.daily_tasks where daily_plan_id=plan and study_item_id=item;
 b := public.add_manual_daily_task(child,today,'ACTIVITY','Manual',null,null,null,10::smallint);
 other_task := public.add_manual_daily_task(child,today-1,'ACTIVITY','Past',null,null,null,10::smallint);
 select daily_plan_id into past_plan from public.daily_tasks where id=other_task;
 select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',id,'expected_updated_at',updated_at,'expected_sort_order',sort_order) order by sort_order desc) into payload from public.daily_tasks where daily_plan_id=plan;
 old_payload := payload;
 select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(t)-'sort_order'-'updated_at' order by t.id) into before_tasks from public.daily_tasks t;
 select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(i) order by i.id) into before_items from public.study_items i;
 select pg_catalog.to_jsonb(c) into before_child from public.children c where c.id=child;
 perform public.reorder_daily_tasks(plan,payload);
 assert (select sort_order=0 from public.daily_tasks where id=b);
 assert (select sort_order=1 from public.daily_tasks where id=a);
 assert before_tasks=(select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(t)-'sort_order'-'updated_at' order by t.id) from public.daily_tasks t), 'Task fields changed';
 assert before_items=(select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(i) order by i.id) from public.study_items i), 'StudyItems changed';
 assert before_child=(select pg_catalog.to_jsonb(c) from public.children c where c.id=child), 'Child/reward changed';
 begin perform public.reorder_daily_tasks(plan,old_payload); raise exception 'stale order accepted'; exception when serialization_failure then null; end;
 select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',id,'expected_updated_at',updated_at,'expected_sort_order',sort_order) order by sort_order desc) into payload from public.daily_tasks where daily_plan_id=plan;
 begin perform public.reorder_daily_tasks(past_plan,payload); raise exception 'past accepted'; exception when invalid_parameter_value then null; end;
 extra := public.ensure_daily_plan(child,today+1);
 begin perform public.reorder_daily_tasks(extra,payload); raise exception 'future accepted'; exception when invalid_parameter_value then null; end;
 begin perform public.reorder_daily_tasks(plan,pg_catalog.jsonb_build_array(payload->0,payload->0)); raise exception 'duplicate accepted'; exception when invalid_parameter_value then null; end;
 begin perform public.reorder_daily_tasks(plan,'[]'); raise exception 'empty accepted'; exception when invalid_parameter_value then null; end;
 begin perform public.reorder_daily_tasks(plan,pg_catalog.jsonb_set(payload,'{0,id}',pg_catalog.to_jsonb(other_task::text))); raise exception 'foreign date task accepted'; exception when serialization_failure then null; end;
 begin perform public.reorder_daily_tasks(plan,pg_catalog.jsonb_set(payload,'{0,expected_updated_at}','"2000-01-01T00:00:00Z"')); raise exception 'stale timestamp accepted'; exception when serialization_failure then null; end;
 perform pg_catalog.set_config('request.jwt.claim.sub',pg_catalog.current_setting('test.other_user'),true);
 begin perform public.reorder_daily_tasks(plan,payload); raise exception 'foreign owner accepted'; exception when insufficient_privilege then null; end;
 perform pg_catalog.set_config('request.jwt.claim.sub',original_user,true);
 extra := public.add_manual_daily_task(child,today,'ACTIVITY','Added while editing',null,null,null,5::smallint);
 begin perform public.reorder_daily_tasks(plan,payload); raise exception 'missing new task accepted'; exception when serialization_failure then null; end;
 select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',id,'expected_updated_at',updated_at,'expected_sort_order',sort_order) order by sort_order desc) into payload from public.daily_tasks where daily_plan_id=plan;
 perform public.start_daily_task(extra);
 begin perform public.reorder_daily_tasks(plan,payload); raise exception 'started task accepted'; exception when serialization_failure then null; end;
 select pg_catalog.to_jsonb(t) into unchanged from public.daily_tasks t where t.id=extra;
 select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',id,'expected_updated_at',updated_at,'expected_sort_order',sort_order) order by sort_order desc) into payload from public.daily_tasks where daily_plan_id=plan and status='PLANNED';
 perform public.reorder_daily_tasks(plan,payload);
 assert unchanged=(select pg_catalog.to_jsonb(t) from public.daily_tasks t where id=extra), 'Started row changed';
end $$;
reset role;
-- Exercise every forbidden status, including anomalous PLANNED + started_at.
do $$
declare plan uuid; payload jsonb; target uuid; state text;
begin
 select dp.id into plan from public.daily_plans dp join public.children c on c.id=dp.child_id join public.profiles p on p.id=c.parent_id where p.auth_user_id=auth.uid() and dp.plan_date=pg_catalog.timezone('Asia/Seoul',pg_catalog.clock_timestamp())::date;
 select id into target from public.daily_tasks where daily_plan_id=plan and status='PLANNED' limit 1;
 foreach state in array array['IN_PROGRESS','CHILD_COMPLETED','RETRY','PARENT_CONFIRMED','PARTIAL','SKIPPED','PLANNED'] loop
  select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',id,'expected_updated_at',updated_at,'expected_sort_order',sort_order)) into payload from public.daily_tasks where daily_plan_id=plan and id in (select id from public.daily_tasks where daily_plan_id=plan and (status='PLANNED' or id=target));
  update public.daily_tasks set status=state,started_at=pg_catalog.now() where id=target;
  begin perform public.reorder_daily_tasks(plan,payload); raise exception 'forbidden state accepted: %',state; exception when serialization_failure then null; end;
  update public.daily_tasks set status='PLANNED',started_at=null where id=target;
 end loop;
end $$;
rollback;
