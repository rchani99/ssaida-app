-- Local-only fixtures. Every row created here is rolled back.
begin;
do $$
declare
  u uuid; c uuid; item uuid; activity uuid; p uuid; target uuid; other_task uuid;
  actual integer; expected_start integer; expected_end integer; proposal jsonb;
  before_item jsonb; before_child jsonb; before_other jsonb; before_task jsonb;
  oldp uuid; oldtask uuid; np uuid; owner uuid; fn regprocedure;
  today date := timezone('Asia/Seoul',clock_timestamp())::date;
begin
  foreach fn in array array[
    'public.preview_quantity_conflict_resolution(uuid)'::regprocedure,
    'public.resolve_quantity_conflict(uuid,text)'::regprocedure
  ] loop
    assert not has_function_privilege('anon',fn,'EXECUTE');
    assert has_function_privilege('authenticated',fn,'EXECUTE');
    assert (select prosecdef and 'search_path=""'=any(proconfig) from pg_proc where oid=fn);
    assert not exists(select 1 from pg_proc p,lateral aclexplode(p.proacl) a where p.oid=fn and a.grantee=0);
  end loop;
  assert (select relrowsecurity from pg_class where oid='public.daily_tasks'::regclass);
  assert not has_column_privilege('authenticated','public.daily_tasks','exclusion_reason','UPDATE');

  foreach actual in array array[93,94,96,98,99,100] loop
    u:=gen_random_uuid(); insert into auth.users(id) values(u);
    perform set_config('request.jwt.claim.sub',u::text,true);
    perform public.complete_parent_onboarding('Resolution matrix',60,'1234');
    select ch.id into c from public.children ch join public.profiles pr on pr.id=ch.parent_id where pr.auth_user_id=u;
    insert into public.study_items(child_id,item_type,name,estimated_minutes,study_weekdays,workbook_pages_per_session,workbook_last_page,workbook_last_completed_page)
    values(c,'WORKBOOK','Book',20,array[1,2,3,4,5,6,7]::smallint[],3,100,91) returning id into item;
    insert into public.study_items(child_id,item_type,name,estimated_minutes,study_weekdays)
    values(c,'ACTIVITY','Unaffected',10,array[1,2,3,4,5,6,7]::smallint[]) returning id into activity;
    oldp:=public.ensure_daily_plan(c,today-1);
    select id into oldtask from public.daily_tasks where daily_plan_id=oldp and study_item_id=item;
    perform public.start_daily_task(oldtask); perform public.complete_daily_task(oldtask);
    p:=public.ensure_daily_plan(c,today);
    select id into target from public.daily_tasks where daily_plan_id=p and study_item_id=item;
    perform public.update_daily_task_quantity(target,(select updated_at from public.daily_tasks where id=target),99);
    -- An unverified earlier completion must never be treated as confirmed full overlap.
    update public.daily_tasks set quantity_conflict='GAP' where id=target;
    begin perform public.preview_quantity_conflict_resolution(target); raise exception 'Provisional completion accepted';
    exception when sqlstate 'PT412' then null; end;
    perform public.confirm_daily_tasks(jsonb_build_array(jsonb_build_object(
      'daily_task_id',oldtask,'status',case when actual<94 then 'PARTIAL' else 'PARENT_CONFIRMED' end,'actual_end_page',actual)));
    -- At 94 the previously raised sticky conflict requires explicit clearance too.
    select to_jsonb(si) into before_item from public.study_items si where id=item;
    select to_jsonb(ch) into before_child from public.children ch where id=c;
    select id,to_jsonb(dt) into other_task,before_other from public.daily_tasks dt where daily_plan_id=p and study_item_id=activity;
    select to_jsonb(dt) into before_task from public.daily_tasks dt where id=target;
    perform set_config('role','authenticated',true);
    proposal:=public.preview_quantity_conflict_resolution(target);
    assert before_task=(select to_jsonb(dt) from public.daily_tasks dt where id=target), 'Preview wrote task';
    assert (proposal->>'confirmed_progress')::integer=actual;
    perform public.resolve_quantity_conflict(target,proposal->>'context_token');
    assert before_item=(select to_jsonb(si) from public.study_items si where id=item), 'Item/override/revision changed';
    assert before_child=(select to_jsonb(ch) from public.children ch where id=c), 'Resolution awarded growth';
    assert before_other=(select to_jsonb(dt) from public.daily_tasks dt where id=other_task), 'Other item changed';
    assert (select quantity_conflict is null and quantity_manually_adjusted from public.daily_tasks where id=target);
    begin perform public.resolve_quantity_conflict(target,proposal->>'context_token'); raise exception 'Duplicate resolution accepted';
    exception when sqlstate 'PT409' then null; end;
    if actual>=99 then
      assert proposal->>'action'='EXCLUDE';
      assert (select status='PLANNED' and excluded_for_today and exclusion_reason='CONFIRMED_PROGRESS'
        and planned_start_page=95 and planned_end_page=99 from public.daily_tasks where id=target);
      begin perform public.start_daily_task(target); raise exception 'Excluded started'; exception when sqlstate 'PT409' then null; end;
      begin perform public.complete_daily_task(target); raise exception 'Excluded completed'; exception when sqlstate 'PT409' then null; end;
      begin perform public.confirm_daily_tasks(jsonb_build_array(jsonb_build_object('daily_task_id',target,'status','PARENT_CONFIRMED','actual_end_page',99)));
        raise exception 'Excluded confirmed'; exception when sqlstate 'PT409' then null; end;
      begin perform public.update_daily_task_quantity(target,(select updated_at from public.daily_tasks where id=target),100);
        raise exception 'Excluded edited'; exception when sqlstate 'PT409' then null; end;
      np:=public.ensure_daily_plan(c,today+1);
      if actual=99 then
        assert exists(select 1 from public.daily_tasks where daily_plan_id=np and study_item_id=item and planned_start_page=100), 'Remaining page lost';
      else
        assert not exists(select 1 from public.daily_tasks where daily_plan_id=np and study_item_id=item);
      end if;
    else
      expected_start:=actual+1; expected_end:=case when actual=93 then 98 else 99 end;
      assert (select planned_start_page=expected_start and planned_end_page=expected_end and not excluded_for_today from public.daily_tasks where id=target), 'Wrong range';
      perform public.start_daily_task(target); perform public.complete_daily_task(target);
      perform public.confirm_daily_tasks(jsonb_build_array(jsonb_build_object('daily_task_id',target,'status','PARENT_CONFIRMED','actual_end_page',expected_end)));
      perform public.confirm_daily_tasks(jsonb_build_array(jsonb_build_object('daily_task_id',target,'status','PARENT_CONFIRMED','actual_end_page',expected_end)));
      assert (select workbook_last_completed_page=expected_end from public.study_items where id=item), 'Progress regressed';
      assert (select pending_growth_points=(before_child->>'pending_growth_points')::numeric+1 from public.children where id=c), 'Duplicate growth';
    end if;
    perform set_config('role','postgres',true);
  end loop;

  -- Separate stale/context/ownership checks on an isolated test family.
  u:=gen_random_uuid(); insert into auth.users(id) values(u);
  perform set_config('request.jwt.claim.sub',u::text,true);
  perform public.complete_parent_onboarding('Resolution stale',60,'1234');
  select ch.id into c from public.children ch join public.profiles pr on pr.id=ch.parent_id where pr.auth_user_id=u;
  insert into public.study_items(child_id,item_type,name,estimated_minutes,study_weekdays,workbook_pages_per_session,workbook_last_page,workbook_last_completed_page)
  values(c,'WORKBOOK','Stale book',20,array[1,2,3,4,5,6,7]::smallint[],5,100,93) returning id into item;
  p:=public.ensure_daily_plan(c,today);
  select id into target from public.daily_tasks where daily_plan_id=p and study_item_id=item;
  update public.daily_tasks set planned_start_page=95,planned_end_page=99,quantity_manually_adjusted=true,quantity_conflict='GAP' where id=target;
  proposal:=public.preview_quantity_conflict_resolution(target);
  update public.study_items set workbook_last_completed_page=96 where id=item;
  begin perform public.resolve_quantity_conflict(target,proposal->>'context_token'); raise exception 'Stale progress accepted'; exception when sqlstate 'PT409' then null; end;
  proposal:=public.preview_quantity_conflict_resolution(target);
  update public.daily_tasks set sort_order=sort_order+1 where id=target;
  begin perform public.resolve_quantity_conflict(target,proposal->>'context_token'); raise exception 'Stale reorder accepted'; exception when sqlstate 'PT409' then null; end;
  proposal:=public.preview_quantity_conflict_resolution(target);
  update public.study_items set planning_revision=gen_random_uuid(),workbook_next_start_page_override=80 where id=item;
  begin perform public.resolve_quantity_conflict(target,proposal->>'context_token'); raise exception 'New generation accepted'; exception when sqlstate 'PT422' then null; end;
  update public.daily_tasks set planning_revision=(select planning_revision from public.study_items where id=item) where id=target;
  proposal:=public.preview_quantity_conflict_resolution(target);
  select to_jsonb(si) into before_item from public.study_items si where id=item;
  perform public.resolve_quantity_conflict(target,proposal->>'context_token');
  assert before_item=(select to_jsonb(si) from public.study_items si where id=item), 'Override consumed by resolution';
  update public.daily_tasks set quantity_conflict='PARTIAL_OVERLAP' where id=target;
  proposal:=public.preview_quantity_conflict_resolution(target);
  update public.daily_tasks set status='IN_PROGRESS',started_at=now() where id=target;
  begin perform public.resolve_quantity_conflict(target,proposal->>'context_token'); raise exception 'Started accepted'; exception when sqlstate 'PT409' then null; end;
  update public.daily_tasks set status='PLANNED',started_at=null where id=target;
  owner:=u;
  perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
  begin perform public.preview_quantity_conflict_resolution(target); raise exception 'Other user accepted'; exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub',owner::text,true);
  update public.daily_plans set plan_date=today-1 where id=p;
  begin perform public.preview_quantity_conflict_resolution(target); raise exception 'Past task accepted'; exception when sqlstate 'PT409' then null; end;
  update public.daily_plans set plan_date=today where id=p;
  insert into public.daily_plans(child_id,plan_date,day_type,target_minutes_snapshot) values(c,today+1,'STUDY',60) returning id into np;
  insert into public.daily_tasks(daily_plan_id,study_item_id,source_type,item_type,name_snapshot,planned_start_page,planned_end_page,planned_minutes,sort_order)
  values(np,item,'AUTO','WORKBOOK','Reserved future',97,100,20,0);
  begin perform public.preview_quantity_conflict_resolution(target); raise exception 'Overlapping future plan accepted'; exception when sqlstate 'PT423' then null; end;
  assert (select quantity_conflict is not null from public.daily_tasks where id=target);
end $$;
rollback;
