begin;
do $$
declare
 u uuid; c uuid; item uuid; activity uuid; oldp uuid; p uuid; fp uuid; np uuid;
 earlier uuid; target uuid; actual integer; expected text; stage text;
 today date := timezone('Asia/Seoul',clock_timestamp())::date;
 before_growth numeric; before_item jsonb; other_task uuid;
begin
 assert not has_function_privilege('anon','public.start_daily_task(uuid)','EXECUTE');
 assert not has_column_privilege('authenticated','public.daily_tasks','quantity_conflict','UPDATE');
 foreach stage in array array['PLANNED','IN_PROGRESS','CHILD_COMPLETED','RETRY'] loop
 foreach actual in array array[93,94,96,98,99,100] loop
 u:=gen_random_uuid(); insert into auth.users(id) values(u);
 perform set_config('request.jwt.claim.sub',u::text,true);
 perform public.complete_parent_onboarding('Conflict audit',60,'1234');
 select ch.id into c from public.children ch join public.profiles pr on pr.id=ch.parent_id where pr.auth_user_id=u;
 insert into public.study_items(child_id,item_type,name,estimated_minutes,study_weekdays,workbook_pages_per_session,workbook_last_page,workbook_last_completed_page)
 values(c,'WORKBOOK','Conflict book',20,array[1,2,3,4,5,6,7]::smallint[],3,100,91) returning id into item;
 insert into public.study_items(child_id,item_type,name,estimated_minutes,study_weekdays)
 values(c,'ACTIVITY','Unaffected activity',10,array[1,2,3,4,5,6,7]::smallint[]) returning id into activity;
 oldp:=public.ensure_daily_plan(c,today-1);
 select id into earlier from public.daily_tasks where daily_plan_id=oldp and study_item_id=item;
 perform public.start_daily_task(earlier); perform public.complete_daily_task(earlier);
 p:=public.ensure_daily_plan(c,today);
 select id into target from public.daily_tasks where daily_plan_id=p and study_item_id=item;
 perform public.update_daily_task_quantity(target,(select updated_at from public.daily_tasks where id=target),99);
 select id into other_task from public.daily_tasks where daily_plan_id=p and study_item_id=activity;
 perform public.update_daily_task_quantity(other_task,(select updated_at from public.daily_tasks where id=other_task),15);
 fp:=public.ensure_daily_plan(c,today+1);
 if stage<>'PLANNED' then perform public.start_daily_task(target); end if;
 if stage in ('CHILD_COMPLETED','RETRY') then perform public.complete_daily_task(target); end if;
 if stage='RETRY' then perform public.confirm_daily_tasks(jsonb_build_array(jsonb_build_object('daily_task_id',target,'status','RETRY','actual_end_page',null))); end if;
 perform public.confirm_daily_tasks(jsonb_build_array(jsonb_build_object('daily_task_id',earlier,'status',case when actual<94 then 'PARTIAL' else 'PARENT_CONFIRMED' end,'actual_end_page',actual)));
 expected:=case when actual=93 then 'GAP' when actual=94 then null when actual<99 then 'PARTIAL_OVERLAP' else 'FULL_OVERLAP' end;
 assert (select quantity_conflict is not distinct from expected and planned_start_page=95 and planned_end_page=99 and status=stage from public.daily_tasks where id=target), 'Classification or immutable snapshot failed';
 select pending_growth_points into before_growth from public.children where id=c;
 select to_jsonb(si) into before_item from public.study_items si where id=item;
 np:=public.ensure_daily_plan(c,today+2);
 assert exists(select 1 from public.daily_tasks where daily_plan_id=np and study_item_id=activity), 'Conflict blocked unrelated activity';
 if expected is not null then
  assert not exists(select 1 from public.daily_tasks where daily_plan_id=np and study_item_id=item), 'Conflict used in new AUTO generation';
  if actual<100 then
   assert (select planned_start_page=actual+1 from public.daily_tasks where daily_plan_id=fp and study_item_id=item), 'Conflict incorrectly advanced recalculation cursor';
  else
   assert not exists(select 1 from public.daily_tasks where daily_plan_id=fp and study_item_id=item);
  end if;
  begin perform public.start_daily_task(target); raise exception 'Conflict started'; exception when sqlstate 'PT409' then null; end;
  begin perform public.complete_daily_task(target); raise exception 'Conflict completed'; exception when sqlstate 'PT409' then null; end;
  begin perform public.confirm_daily_tasks(jsonb_build_array(jsonb_build_object('daily_task_id',target,'status','PARENT_CONFIRMED','actual_end_page',99))); raise exception 'Conflict confirmed'; exception when sqlstate 'PT409' then null; end;
  begin perform public.update_daily_task_quantity(target,(select updated_at from public.daily_tasks where id=target),99); raise exception 'Conflict cleared through quantity edit'; exception when sqlstate 'PT409' then null; end;
  assert before_item=(select to_jsonb(si) from public.study_items si where id=item);
  assert (select pending_growth_points=before_growth from public.children where id=c);
 else
  if stage<>'CHILD_COMPLETED' then perform public.start_daily_task(target); perform public.complete_daily_task(target); end if;
  perform public.confirm_daily_tasks(jsonb_build_array(jsonb_build_object('daily_task_id',target,'status','PARENT_CONFIRMED','actual_end_page',99)));
  perform public.confirm_daily_tasks(jsonb_build_array(jsonb_build_object('daily_task_id',target,'status','PARENT_CONFIRMED','actual_end_page',99)));
  assert (select workbook_last_completed_page=99 from public.study_items where id=item);
  assert (select pending_growth_points=before_growth+1 from public.children where id=c), 'Duplicate reward';
 end if;
 assert (select quantity_conflict is null and planned_minutes=15 from public.daily_tasks where id=other_task);
 perform public.start_daily_task(other_task);
 end loop;
 end loop;
end $$;
rollback;
