-- Run only against local Supabase. All fixtures roll back.
begin;
do $$
declare owner_id uuid := pg_catalog.gen_random_uuid(); other_id uuid := pg_catalog.gen_random_uuid();
begin
  insert into auth.users(id) values(owner_id), (other_id);
  perform pg_catalog.set_config('request.jwt.claim.sub', owner_id::text, true);
  perform pg_catalog.set_config('test.other_user', other_id::text, true);
  assert not pg_catalog.has_function_privilege('anon', 'public.change_parent_pin(text,text)', 'EXECUTE');
  assert pg_catalog.has_function_privilege('authenticated', 'public.change_parent_pin(text,text)', 'EXECUTE');
  assert (select prosecdef and 'search_path=""' = any(proconfig) from pg_catalog.pg_proc where oid = 'public.change_parent_pin(text,text)'::regprocedure);
end $$;
set local role authenticated;
do $$
declare child_id uuid; plan_id uuid; snapshot smallint; owner_user text := auth.uid()::text;
begin
  perform public.complete_parent_onboarding('기존 이름', 60, '1234');
  select id into child_id from public.children;
  plan_id := public.ensure_daily_plan(child_id, '2031-01-01');
  select target_minutes_snapshot into snapshot from public.daily_plans where id = plan_id;

  assert public.change_parent_pin('0000', '5678') = 'invalid';
  begin
    perform public.change_parent_pin('1234', '12ab');
    raise exception 'malformed new PIN accepted';
  exception when invalid_parameter_value then null;
  end;
  assert public.change_parent_pin('1234', '1234') = 'same';
  assert public.change_parent_pin('1234', '5678') = 'changed';
  assert public.verify_parent_pin('1234') = false;
  assert public.verify_parent_pin('5678') = true;

  update public.children set name = '새 이름', daily_target_minutes = 90 where id = child_id;
  assert (select name = '새 이름' and daily_target_minutes = 90 from public.children where id = child_id);
  assert (select target_minutes_snapshot = snapshot from public.daily_plans where id = plan_id), 'existing snapshot changed';

  perform pg_catalog.set_config('request.jwt.claim.sub', pg_catalog.current_setting('test.other_user'), true);
  assert not exists(select 1 from public.children where id = child_id), 'foreign child visible';
  update public.children set name = '침입' where id = child_id;
  begin
    perform public.change_parent_pin('5678', '9999');
    raise exception 'foreign credential change accepted';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.parent_pin_credentials set pin_hash = '9999';
    raise exception 'direct credential update accepted';
  exception when insufficient_privilege then null;
  end;
  perform pg_catalog.set_config('request.jwt.claim.sub', owner_user, true);
  assert (select name = '새 이름' from public.children where id = child_id), 'foreign child changed';
  raise notice 'Settings MVP DB regression PASS';
end $$;
reset role;
do $$
begin
  assert not exists(
    select 1 from public.parent_pin_credentials
    where pin_hash in ('1234', '5678')
  ), 'plain PIN remained in credential storage';
end $$;
rollback;
