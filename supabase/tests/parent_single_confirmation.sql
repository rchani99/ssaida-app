-- Local-only fixtures. No application data persists.
begin;
do $$
declare u uuid := gen_random_uuid();
begin
  insert into auth.users(id) values(u);
  perform set_config('request.jwt.claim.sub', u::text, true);
end $$;
set local role authenticated;
do $$
declare c uuid; a uuid; b uuid; d date := timezone('Asia/Seoul', now())::date;
begin
  perform public.complete_parent_onboarding('Single confirm',60,'1234');
  select children.id into c from public.children join public.profiles p on p.id=children.parent_id where p.auth_user_id=auth.uid();
  a := public.add_manual_daily_task(c,d,'ACTIVITY','A',null,null,null,20::smallint);
  b := public.add_manual_daily_task(c,d,'ACTIVITY','B',null,null,null,20::smallint);
  perform public.start_daily_task(a); perform public.complete_daily_task(a);
  perform public.start_daily_task(b); perform public.complete_daily_task(b);
  perform public.confirm_daily_tasks(jsonb_build_array(jsonb_build_object('daily_task_id',a,'status','PARENT_CONFIRMED','actual_end_page',null)));
  assert (select status='PARENT_CONFIRMED' and parent_verified_at is not null from public.daily_tasks where id=a), 'A must be confirmed';
  assert (select status='CHILD_COMPLETED' and parent_verified_at is null from public.daily_tasks where id=b), 'B must remain pending';
end $$;
rollback;
