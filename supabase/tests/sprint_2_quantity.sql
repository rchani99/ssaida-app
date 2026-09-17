-- Local fixtures only; rollback preserves all existing data.
begin;
do $$
declare u uuid := gen_random_uuid(); v uuid := gen_random_uuid();
begin
 insert into auth.users(id) values(u),(v);
 perform set_config('request.jwt.claim.sub',u::text,true);
 perform set_config('test.other_user',v::text,true);
 assert not has_function_privilege('anon','public.update_daily_task_quantity(uuid,timestamptz,numeric)','EXECUTE');
 assert has_function_privilege('authenticated','public.update_daily_task_quantity(uuid,timestamptz,numeric)','EXECUTE');
 assert not has_column_privilege('authenticated','public.daily_tasks','quantity_manually_adjusted','UPDATE');
 assert (select prosecdef and 'search_path=""'=any(proconfig) from pg_proc where oid='public.update_daily_task_quantity(uuid,timestamptz,numeric)'::regprocedure);
 assert not exists(select 1 from pg_proc p,lateral aclexplode(p.proacl) a where p.oid='public.update_daily_task_quantity(uuid,timestamptz,numeric)'::regprocedure and a.grantee=0);
end $$;
set local role authenticated;
do $$
declare
 c uuid; item uuid; item2 uuid; p uuid; oldp uuid; nextp uuid; a uuid; b uuid; oldtask uuid; protected2 uuid; old2 uuid;
 today date := timezone('Asia/Seoul',clock_timestamp())::date;
 before_item jsonb; before_child jsonb; before_task jsonb; stamp timestamptz; val numeric; owner text := auth.uid()::text;
begin
 perform public.complete_parent_onboarding('Quantity regression',60,'1234');
 select id into c from public.children;
 insert into public.study_items(child_id,item_type,name,estimated_minutes,study_weekdays,workbook_pages_per_session,workbook_last_page,workbook_last_completed_page)
 values(c,'WORKBOOK','Workbook',20,array[1,2,3,4,5,6,7]::smallint[],5,100,0) returning id into item;
 insert into public.study_items(child_id,item_type,name,estimated_minutes,study_weekdays,workbook_pages_per_session,workbook_last_page,workbook_last_completed_page)
 values(c,'WORKBOOK','Completed protection',20,array[1,2,3,4,5,6,7]::smallint[],5,100,0) returning id into item2;
 oldp := public.ensure_daily_plan(c,today-1);
 select id into oldtask from public.daily_tasks where daily_plan_id=oldp and study_item_id=item;
 select id into old2 from public.daily_tasks where daily_plan_id=oldp and study_item_id=item2;
 perform public.start_daily_task(oldtask); perform public.complete_daily_task(oldtask);
 perform public.start_daily_task(old2); perform public.complete_daily_task(old2);
 p := public.ensure_daily_plan(c,today);
 select id,updated_at into a,stamp from public.daily_tasks where daily_plan_id=p and study_item_id=item;
 select id into protected2 from public.daily_tasks where daily_plan_id=p and study_item_id=item2;
 select to_jsonb(i) into before_item from public.study_items i where id=item;
 select to_jsonb(ch) into before_child from public.children ch where id=c;
 select to_jsonb(t)-'planned_end_page'-'quantity_manually_adjusted'-'updated_at' into before_task from public.daily_tasks t where id=a;
 perform public.update_daily_task_quantity(a,stamp,8);
 assert (select planned_start_page=6 and planned_end_page=8 and quantity_manually_adjusted from public.daily_tasks where id=a);
 assert before_task=(select to_jsonb(t)-'planned_end_page'-'quantity_manually_adjusted'-'updated_at' from public.daily_tasks t where id=a);
 assert before_item=(select to_jsonb(i) from public.study_items i where id=item), 'StudyItem/progress/override/revision changed';
 assert before_child=(select to_jsonb(ch) from public.children ch where id=c), 'Growth changed on edit';
 foreach val in array array[0,5,101,1.5,2147483648,'NaN'::numeric,'Infinity'::numeric,null] loop
  begin perform public.update_daily_task_quantity(a,(select updated_at from public.daily_tasks where id=a),val); raise exception 'Invalid workbook value accepted'; exception when invalid_parameter_value then null; end;
 end loop;
 begin perform public.update_daily_task_quantity(a,'2000-01-01',8); raise exception 'Stale accepted'; exception when sqlstate 'PT409' then null; end;
 perform set_config('request.jwt.claim.sub',current_setting('test.other_user'),true);
 begin perform public.update_daily_task_quantity(a,stamp,8); raise exception 'Other owner accepted'; exception when insufficient_privilege then null; end;
 perform set_config('request.jwt.claim.sub','',true);
 begin perform public.update_daily_task_quantity(a,stamp,8); raise exception 'Anon accepted'; exception when insufficient_privilege then null; end;
 perform set_config('request.jwt.claim.sub',owner,true);
 b := public.add_manual_daily_task(c,today,'ACTIVITY','Manual activity',null,null,null,5::smallint);
 perform public.update_daily_task_quantity(b,(select updated_at from public.daily_tasks where id=b),32767);
 assert (select planned_minutes=32767 from public.daily_tasks where id=b);
 foreach val in array array[0,-1,1.5,32768,null] loop
  begin perform public.update_daily_task_quantity(b,(select updated_at from public.daily_tasks where id=b),val); raise exception 'Invalid minutes accepted'; exception when invalid_parameter_value then null; end;
 end loop;
 perform public.start_daily_task(b);
 begin perform public.update_daily_task_quantity(b,(select updated_at from public.daily_tasks where id=b),5); raise exception 'Started accepted'; exception when sqlstate 'PT409' then null; end;
 b := public.add_manual_daily_task(c,today,'WORKBOOK','Standalone',null,10,12,5::smallint);
 perform public.update_daily_task_quantity(b,(select updated_at from public.daily_tasks where id=b),15);
 assert (select planned_start_page=10 and planned_end_page=15 from public.daily_tasks where id=b);
 nextp := public.ensure_daily_plan(c,today+1);
 begin perform public.update_daily_task_quantity(oldtask,(select updated_at from public.daily_tasks where id=oldtask),5); raise exception 'Past accepted'; exception when sqlstate 'PT409' then null; end;
 b := (select id from public.daily_tasks where daily_plan_id=nextp and study_item_id=item);
 begin perform public.update_daily_task_quantity(b,(select updated_at from public.daily_tasks where id=b),8); raise exception 'Future accepted'; exception when sqlstate 'PT409' then null; end;
 -- Normal connection: prior 1~5 confirmed, protected next task remains 6~8.
 perform public.confirm_daily_tasks(jsonb_build_array(jsonb_build_object('daily_task_id',oldtask,'status','PARENT_CONFIRMED','actual_end_page',5)));
 assert (select planned_start_page=6 and planned_end_page=8 from public.daily_tasks where id=a), 'Manual quantity overwritten';
 assert (select planned_start_page=9 and planned_end_page=13 and not quantity_manually_adjusted from public.daily_tasks where id=b), 'Untouched AUTO not recalculated';
 assert (select workbook_last_completed_page=5 from public.study_items where id=item);
 assert (select pending_growth_points=1 from public.children where id=c), 'Growth changed';
 perform public.update_daily_task_quantity(protected2,(select updated_at from public.daily_tasks where id=protected2),9);
 perform public.confirm_daily_tasks(jsonb_build_array(jsonb_build_object('daily_task_id',old2,'status','PARENT_CONFIRMED','actual_end_page',100)));
 assert (select planned_start_page=6 and planned_end_page=9 from public.daily_tasks where id=protected2), 'Protected completed-workbook plan deleted';
 assert not exists(select 1 from public.daily_tasks where daily_plan_id=nextp and study_item_id=item2), 'Untouched exhausted plan not deleted';
 assert (select status='COMPLETED' and workbook_last_completed_page=100 from public.study_items where id=item2);
 perform public.start_daily_task(a); perform public.complete_daily_task(a);
 perform public.confirm_daily_tasks(jsonb_build_array(jsonb_build_object('daily_task_id',a,'status','PARENT_CONFIRMED','actual_end_page',8)));
 assert (select workbook_last_completed_page=8 from public.study_items where id=item);
 assert (select pending_growth_points=3 from public.children where id=c), 'Edited denominator/full growth changed';
 perform set_config('test.quantity_task',protected2::text,true);
end $$;
reset role;
do $$
declare t uuid := current_setting('test.quantity_task')::uuid; state text;
begin
 foreach state in array array['IN_PROGRESS','CHILD_COMPLETED','RETRY','PARENT_CONFIRMED','PARTIAL','SKIPPED','PLANNED'] loop
  update public.daily_tasks set status=state,started_at=now() where id=t;
  begin perform public.update_daily_task_quantity(t,(select updated_at from public.daily_tasks where id=t),9); raise exception 'Forbidden status accepted: %',state; exception when sqlstate 'PT409' then null; end;
 end loop;
end $$;
rollback;
