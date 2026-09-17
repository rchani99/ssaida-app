-- Local-only fixtures; no existing user data is changed.
begin;
do $$
declare u uuid := gen_random_uuid(); v uuid := gen_random_uuid();
begin
 insert into auth.users(id) values(u),(v);
 perform set_config('request.jwt.claim.sub',u::text,true);
 perform set_config('test.other_user',v::text,true);
 assert not has_function_privilege('anon','public.exclude_daily_task(uuid,timestamptz)','EXECUTE');
 assert has_function_privilege('authenticated','public.exclude_daily_task(uuid,timestamptz)','EXECUTE');
 assert not has_column_privilege('authenticated','public.daily_tasks','excluded_for_today','UPDATE');
 assert (select relrowsecurity from pg_class where oid='public.daily_tasks'::regclass);
 assert (select prosecdef and 'search_path=""'=any(proconfig) from pg_proc where oid='public.exclude_daily_task(uuid,timestamptz)'::regprocedure);
 assert not exists(select 1 from pg_proc p,lateral aclexplode(p.proacl) a where p.oid='public.exclude_daily_task(uuid,timestamptz)'::regprocedure and a.grantee=0);
end $$;
set local role authenticated;
do $$
declare
 c uuid; book uuid; activity uuid; p uuid; oldp uuid; nextp uuid;
 a uuid; b uuid; oldtask uuid; manual uuid; moved uuid; future uuid;
 today date := timezone('Asia/Seoul',clock_timestamp())::date;
 before_item jsonb; before_child jsonb; before_task jsonb; stamp timestamptz;
 owner text := auth.uid()::text; stale_order jsonb;
begin
 perform public.complete_parent_onboarding('Exclusion regression',60,'1234');
 select id into c from public.children;
 insert into public.study_items(child_id,item_type,name,estimated_minutes,study_weekdays,workbook_pages_per_session,workbook_last_page,workbook_last_completed_page)
 values(c,'WORKBOOK','Book',20,array[1,2,3,4,5,6,7]::smallint[],5,100,0) returning id into book;
 insert into public.study_items(child_id,item_type,name,estimated_minutes,study_weekdays)
 values(c,'ACTIVITY','Activity',10,array[1,2,3,4,5,6,7]::smallint[]) returning id into activity;
 oldp := public.ensure_daily_plan(c,today-1);
 select id into oldtask from public.daily_tasks where daily_plan_id=oldp and study_item_id=book;
 perform public.start_daily_task(oldtask); perform public.complete_daily_task(oldtask);
 p := public.ensure_daily_plan(c,today);
 select id,updated_at into a,stamp from public.daily_tasks where daily_plan_id=p and study_item_id=book;
 select id into b from public.daily_tasks where daily_plan_id=p and study_item_id=activity;
 select jsonb_agg(jsonb_build_object('id',id,'expected_updated_at',updated_at,'expected_sort_order',sort_order) order by sort_order desc)
 into stale_order from public.daily_tasks where daily_plan_id=p;
 select to_jsonb(i) into before_item from public.study_items i where id=book;
 select to_jsonb(ch) into before_child from public.children ch where id=c;
 select to_jsonb(t)-'excluded_for_today'-'updated_at' into before_task from public.daily_tasks t where id=a;
 perform set_config('request.jwt.claim.sub',current_setting('test.other_user'),true);
 begin perform public.exclude_daily_task(a,stamp); raise exception 'Other owner accepted'; exception when insufficient_privilege then null; end;
 perform set_config('request.jwt.claim.sub','',true);
 begin perform public.exclude_daily_task(a,stamp); raise exception 'Anon accepted'; exception when insufficient_privilege then null; end;
 perform set_config('request.jwt.claim.sub',owner,true);
 begin perform public.exclude_daily_task(a,'2000-01-01'); raise exception 'Stale accepted'; exception when sqlstate 'PT409' then null; end;
 perform public.exclude_daily_task(a,stamp);
 assert (select excluded_for_today and status='PLANNED' and started_at is null from public.daily_tasks where id=a);
 assert before_task=(select to_jsonb(t)-'excluded_for_today'-'updated_at' from public.daily_tasks t where id=a), 'Snapshot changed';
 assert before_item=(select to_jsonb(i) from public.study_items i where id=book), 'StudyItem/progress/override/revision changed';
 assert before_child=(select to_jsonb(ch) from public.children ch where id=c), 'Growth changed';
 begin perform public.start_daily_task(a); raise exception 'Excluded start accepted'; exception when sqlstate 'PT409' then null; end;
 begin perform public.complete_daily_task(a); raise exception 'Excluded completion accepted'; exception when sqlstate 'PT409' then null; end;
 begin perform public.confirm_daily_tasks(jsonb_build_array(jsonb_build_object('daily_task_id',a,'status','PARENT_CONFIRMED','actual_end_page',10))); raise exception 'Excluded confirm accepted'; exception when sqlstate 'PT409' then null; end;
 begin perform public.update_daily_task_quantity(a,(select updated_at from public.daily_tasks where id=a),12); raise exception 'Excluded edit accepted'; exception when sqlstate 'PT409' then null; end;
 begin perform public.reorder_daily_tasks(p,stale_order); raise exception 'Stale reorder accepted'; exception when serialization_failure then null; end;
 perform public.ensure_daily_plan(c,today);
 assert (select count(*)=1 from public.daily_tasks where daily_plan_id=p and study_item_id=book), 'Frozen plan recreated';
 -- Exclusion is not progress/provisional progress. Following date is included normally.
 nextp := public.ensure_daily_plan(c,today+1);
 select id into future from public.daily_tasks where daily_plan_id=nextp and study_item_id=book;
 assert (select not excluded_for_today and planned_start_page=6 and planned_end_page=10 from public.daily_tasks where id=future);
 begin perform public.exclude_daily_task(future,(select updated_at from public.daily_tasks where id=future)); raise exception 'Future accepted'; exception when sqlstate 'PT409' then null; end;
 -- Late confirmation preserves the excluded record without using it as cursor.
 perform public.confirm_daily_tasks(jsonb_build_array(jsonb_build_object('daily_task_id',oldtask,'status','PARTIAL','actual_end_page',3)));
 assert before_task=(select to_jsonb(t)-'excluded_for_today'-'updated_at' from public.daily_tasks t where id=a), 'Excluded snapshot recalculated';
 assert (select planned_start_page=4 and planned_end_page=8 from public.daily_tasks where id=future), 'Excluded snapshot consumed pages';
 manual := public.add_manual_daily_task(c,today-1,'ACTIVITY','Manual',null,null,null,5::smallint);
 moved := public.reschedule_manual_task(manual,today);
 assert (select status='PLANNED' from public.daily_tasks where id=manual);
 begin perform public.exclude_daily_task(moved,(select updated_at from public.daily_tasks where id=moved)); raise exception 'Rescheduled accepted'; exception when sqlstate 'PT409' then null; end;
 manual := public.add_manual_daily_task(c,today,'ACTIVITY','Manual today',null,null,null,5::smallint);
 begin perform public.exclude_daily_task(manual,(select updated_at from public.daily_tasks where id=manual)); raise exception 'Manual accepted'; exception when sqlstate 'PT409' then null; end;
 perform public.skip_manual_task(manual);
 assert (select status='SKIPPED' and not excluded_for_today from public.daily_tasks where id=manual);
 perform public.start_daily_task(b);
 begin perform public.exclude_daily_task(b,(select updated_at from public.daily_tasks where id=b)); raise exception 'Started accepted'; exception when sqlstate 'PT409' then null; end;
 perform public.complete_daily_task(b);
 perform public.confirm_daily_tasks(jsonb_build_array(jsonb_build_object('daily_task_id',b,'status','PARENT_CONFIRMED','actual_end_page',null)));
 assert (select status='PARENT_CONFIRMED' from public.daily_tasks where id=b), 'Normal work blocked';
 -- Save one non-excluded task for exhaustive forbidden-state checks as fixture owner.
 perform set_config('test.exclusion_task',moved::text,true);
end $$;
reset role;
do $$
declare t uuid := current_setting('test.exclusion_task')::uuid; state text;
begin
 update public.daily_tasks set source_type='AUTO',source_daily_task_id=null where id=t;
 foreach state in array array['IN_PROGRESS','CHILD_COMPLETED','RETRY','PARENT_CONFIRMED','PARTIAL','SKIPPED'] loop
  update public.daily_tasks set status=state,started_at=null where id=t;
  begin perform public.exclude_daily_task(t,(select updated_at from public.daily_tasks where id=t)); raise exception 'Forbidden status accepted: %',state; exception when sqlstate 'PT409' then null; end;
 end loop;
 update public.daily_tasks set status='PLANNED',started_at=now() where id=t;
 begin perform public.exclude_daily_task(t,(select updated_at from public.daily_tasks where id=t)); raise exception 'Started PLANNED accepted'; exception when sqlstate 'PT409' then null; end;
 update public.daily_tasks set started_at=null,item_type='WORKBOOK',planned_start_page=1,planned_end_page=5,quantity_manually_adjusted=true,quantity_conflict='GAP' where id=t;
 begin perform public.exclude_daily_task(t,(select updated_at from public.daily_tasks where id=t)); raise exception 'Conflict accepted'; exception when sqlstate 'PT409' then null; end;
end $$;
rollback;
