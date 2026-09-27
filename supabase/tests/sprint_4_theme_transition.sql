-- Only through the local runner, inside its rollback transaction.
-- Isolate the fixed test catalog without permanently changing existing data.
update public.collectible_catalog set is_active = false;
insert into public.collectible_catalog(theme_code,code,name,growth_goal,sort_order)
values ('DINO','S4_TEST_D1','D1',1,1), ('DINO','S4_TEST_D2','D2',1,2),
       ('GEM','S4_TEST_G1','G1',2,1), ('GEM','S4_TEST_G2','G2',2,2);

do $$
declare u uuid := gen_random_uuid(); other_u uuid := gen_random_uuid();
begin
  insert into auth.users(id) values(u),(other_u);
  perform set_config('request.jwt.claim.sub',u::text,true);
  perform set_config('test.owner',u::text,true);
  perform set_config('test.other',other_u::text,true);
  assert (select prosecdef and 'search_path=""'=any(proconfig) from pg_proc
    where oid='public.select_collection_theme(text)'::regprocedure);
  assert has_function_privilege('authenticated','public.select_collection_theme(text)','EXECUTE');
  assert not has_function_privilege('anon','public.select_collection_theme(text)','EXECUTE');
  assert not has_function_privilege('service_role','public.select_collection_theme(text)','EXECUTE');
  assert not exists(select 1 from pg_proc p, lateral aclexplode(p.proacl) a
    where p.oid='public.select_collection_theme(text)'::regprocedure and a.grantee=0);
end $$;

set local role anon;
do $$ begin
  begin perform public.select_collection_theme('DINO');
    raise exception 'anon accepted';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role authenticated;
do $$
declare c uuid; first_item uuid; second_item uuid; task uuid; other_c uuid;
  today date := timezone('Asia/Seoul',clock_timestamp())::date;
begin
  perform public.complete_parent_onboarding('Theme regression',60,'1234');
  select id into c from public.children;
  perform set_config('test.child',c::text,true);
  perform public.select_collection_theme('DINO');
  select id into first_item from public.child_collectibles where child_id=c;
  assert first_item is not null, 'initial selection';
  perform public.select_collection_theme('DINO');
  assert (select count(*)=1 from public.child_collectibles where child_id=c), 'same-theme duplicated';
  begin perform public.select_collection_theme('GEM');
    raise exception 'growing theme switch accepted';
  exception when invalid_parameter_value then null; end;

  -- Complete five activities: one direct point, then four pending points.
  for i in 1..5 loop
    task := public.add_manual_daily_task(c,today,'ACTIVITY','Growth test',null,null,null,5::smallint);
    perform public.start_daily_task(task);
    perform public.complete_daily_task(task);
    assert (select reward_collection_theme_code='DINO' from public.daily_tasks where id=task);
    perform public.confirm_daily_tasks(jsonb_build_array(jsonb_build_object(
      'daily_task_id',task,'status','PARENT_CONFIRMED','actual_end_page',null)));
    -- Retrying an identical confirmation must not pay twice.
    perform public.confirm_daily_tasks(jsonb_build_array(jsonb_build_object(
      'daily_task_id',task,'status','PARENT_CONFIRMED','actual_end_page',null)));
  end loop;
  assert (select pending_growth_points=4 from public.children where id=c), 'pending or duplicate growth';
  assert (select status='COMPLETED' and revealed_at is null from public.child_collectibles where id=first_item);
  begin perform public.select_collection_theme('GEM');
    raise exception 'unrevealed theme switch accepted';
  exception when invalid_parameter_value then null; end;
  assert (select pending_growth_points=4 and selected_collection_theme_code='DINO' from public.children where id=c);
  perform public.reveal_collectible(first_item);
  perform public.reveal_collectible(first_item);
  assert (select count(*)=2 from public.child_collectibles where child_id=c), 'duplicate reveal';
  select id into second_item from public.child_collectibles where child_id=c and id<>first_item;
  assert (select status='COMPLETED' and revealed_at is null from public.child_collectibles where id=second_item);
  assert (select pending_growth_points=3 from public.children where id=c), 'one-item pending limit';
  begin perform public.select_collection_theme('GEM');
    raise exception 'last unrevealed item counted as collected';
  exception when invalid_parameter_value then null; end;
  perform public.reveal_collectible(second_item);
  assert (select count(*)=2 from public.child_collectibles where child_id=c), 'exhausted catalog duplicated';
  perform public.select_collection_theme('GEM');
  assert (select selected_collection_theme_code='GEM' and pending_growth_points=1 from public.children where id=c);
  assert (select count(*)=1 from public.child_collectibles where child_id=c and theme_code='GEM');
  assert exists(select 1 from public.child_collectibles where child_id=c and theme_code='GEM'
    and status='COMPLETED' and revealed_at is null and progress_points=2);
  assert (select sum(growth_points)=4 from public.collectible_growth_events), 'direct + pending ledger';

  task := public.add_manual_daily_task(c,today,'WORKBOOK','Partial growth',null,1,5,5::smallint);
  perform public.start_daily_task(task);
  perform public.complete_daily_task(task);
  perform public.confirm_daily_tasks(jsonb_build_array(jsonb_build_object(
    'daily_task_id',task,'status','PARTIAL','actual_end_page',3)));
  perform public.confirm_daily_tasks(jsonb_build_array(jsonb_build_object(
    'daily_task_id',task,'status','PARTIAL','actual_end_page',3)));
  assert (select pending_growth_points=1.6 from public.children where id=c), 'partial growth duplicated';
  task := public.add_manual_daily_task(c,today,'ACTIVITY','Retry growth',null,null,null,5::smallint);
  perform public.start_daily_task(task);
  perform public.complete_daily_task(task);
  perform public.confirm_daily_tasks(jsonb_build_array(jsonb_build_object(
    'daily_task_id',task,'status','RETRY','actual_end_page',null)));
  assert (select pending_growth_points=1.6 from public.children where id=c), 'RETRY awarded growth';

  -- No child parameter exists: identity must always come from auth.uid().
  perform set_config('request.jwt.claim.sub',current_setting('test.other'),true);
  assert not exists(select 1 from public.children where id=c), 'foreign child visible';
  begin perform public.select_collection_theme('DINO');
    raise exception 'account without child accepted';
  exception when insufficient_privilege then null; end;
  perform public.complete_parent_onboarding('Other regression',60,'1234');
  select id into other_c from public.children;
  perform public.select_collection_theme('DINO');
  assert (select count(*)=1 from public.child_collectibles where child_id=other_c);
  begin perform public.reveal_collectible(first_item);
    raise exception 'foreign reveal accepted';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub',current_setting('test.owner'),true);
  assert (select pending_growth_points=1.6 and selected_collection_theme_code='GEM' from public.children where id=c);
  raise notice 'PASS first/same/cross-theme, unrevealed, final reveal, growth/pending, ownership';
end $$;
reset role;

-- Existing multi-theme data must survive both rejected and allowed transitions.
insert into public.child_collectibles(child_id,theme_code,collectible_catalog_id,sequence_no,growth_goal_snapshot)
select current_setting('test.child')::uuid,'GEM',id,99,growth_goal
from public.collectible_catalog catalog
where code in ('S4_TEST_G1','S4_TEST_G2')
  and not exists(select 1 from public.child_collectibles cc
    where cc.child_id=current_setting('test.child')::uuid and cc.collectible_catalog_id=catalog.id);
select set_config('test.legacy', (select to_jsonb(cc)::text from public.child_collectibles cc
  where child_id=current_setting('test.child')::uuid and sequence_no=99),true);
update public.children set selected_collection_theme_code='DINO' where id=current_setting('test.child')::uuid;
-- A zero-active current theme is NOT complete.
update public.collectible_catalog set is_active=false where theme_code='DINO';
set local role authenticated;
do $$ begin
  begin perform public.select_collection_theme('GEM');
    raise exception 'empty active catalog considered complete';
  exception when invalid_parameter_value then null; end;
end $$;
reset role;
update public.collectible_catalog set is_active=true where code in ('S4_TEST_D1','S4_TEST_D2');
set local role authenticated;
do $$ begin
  perform public.select_collection_theme('GEM');
  assert (select to_jsonb(cc)=current_setting('test.legacy')::jsonb from public.child_collectibles cc
    where child_id=current_setting('test.child')::uuid and sequence_no=99), 'legacy data changed';
  assert (select pending_growth_points=1.6 from public.children where id=current_setting('test.child')::uuid);
  raise notice 'PASS zero-active guard, inactive catalog ignored, legacy data preservation';
end $$;
reset role;
