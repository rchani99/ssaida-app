-- Runner wraps both migration and these fixtures in one rollback transaction.
do $$
declare
  owner_id uuid := gen_random_uuid();
  parent uuid;
  child uuid;
  task uuid;
  skipped uuid;
  recorded_time timestamptz;
begin
  assert not has_table_privilege('anon','public.pilot_core_cycles','SELECT');
  assert not has_table_privilege('authenticated','public.pilot_core_cycles','SELECT');
  assert not has_table_privilege('authenticated','public.pilot_core_cycles','INSERT');
  assert has_table_privilege('service_role','public.pilot_core_cycles','SELECT');
  assert (select relrowsecurity from pg_class where oid='public.pilot_core_cycles'::regclass);
  insert into auth.users(id) values(owner_id);
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  perform public.complete_parent_onboarding('Pilot fixture',60,'1234');
  select id into strict parent from public.profiles where auth_user_id=owner_id;
  select id into strict child from public.children where parent_id=parent;
  task := public.add_manual_daily_task(child,current_date,'ACTIVITY','Pilot fixture',null,null,null,5::smallint);
  assert not exists(select from public.pilot_core_cycles where daily_task_id=task);
  perform public.start_daily_task(task);
  perform public.complete_daily_task(task);
  assert not exists(select from public.pilot_core_cycles where daily_task_id=task);
  perform public.confirm_daily_tasks(jsonb_build_array(jsonb_build_object('daily_task_id',task,'status','RETRY','actual_end_page',null)));
  select parent_verified_at into strict recorded_time from public.pilot_core_cycles where daily_task_id=task and parent_id=parent;
  assert (select verification_status='RETRY' from public.pilot_core_cycles where daily_task_id=task);
  -- Reopening and reviewing again must not manufacture a second core cycle.
  perform public.start_daily_task(task);
  perform public.complete_daily_task(task);
  perform public.confirm_daily_tasks(jsonb_build_array(jsonb_build_object('daily_task_id',task,'status','RETRY','actual_end_page',null)));
  assert (select count(*)=1 from public.pilot_core_cycles where daily_task_id=task);
  assert (select parent_verified_at=recorded_time from public.pilot_core_cycles where daily_task_id=task);
  skipped := public.add_manual_daily_task(child,current_date,'ACTIVITY','Skipped fixture',null,null,null,5::smallint);
  update public.daily_tasks set status='SKIPPED',parent_verified_at=now() where id=skipped;
  assert not exists(select from public.pilot_core_cycles where daily_task_id=skipped);
  delete from public.daily_tasks where id=task;
  assert exists(select from public.pilot_core_cycles where daily_task_id=task);
  delete from auth.users where id=owner_id;
  assert not exists(select from public.pilot_core_cycles where parent_id=parent);
end;
$$;
