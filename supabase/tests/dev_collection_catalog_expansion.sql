-- Run only on the linked DEV project. Every simulated reveal is rolled back.
begin;
do $$
declare
  test_child uuid;
  owner_auth uuid;
  current_item uuid;
  total integer;
  revealed integer;
  expected integer;
  current_code text;
begin
  select child.id, profile.auth_user_id
    into strict test_child, owner_auth
  from public.children child
  join public.profiles profile on profile.id = child.parent_id
  where child.selected_collection_theme_code = 'COIN';
  perform 1 from public.children where id = test_child for update;
  perform set_config('request.jwt.claim.sub', owner_auth::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', owner_auth, 'role', 'authenticated')::text, true);
  select count(*) into total from public.collectible_catalog where theme_code = 'COIN' and is_active;
  if total <> 6 then raise exception 'This DEV fixture expects six starting items'; end if;
  select count(*) into revealed from public.child_collectibles where child_id = test_child and theme_code = 'COIN' and revealed_at is not null;

  for expected in (revealed + 1)..total loop
    select id into strict current_item from public.child_collectibles
    where child_id = test_child and theme_code = 'COIN' and status = 'GROWING';
    update public.child_collectibles set progress_points = growth_goal_snapshot, status = 'COMPLETED', completed_at = now()
    where id = current_item;
    perform public.reveal_collectible(current_item);
    select count(*) into revealed from public.child_collectibles
    where child_id = test_child and theme_code = 'COIN' and revealed_at is not null;
    if revealed <> expected then raise exception 'Reveal count mismatch: % / %', revealed, expected; end if;
    if expected < total and not exists (
      select 1 from public.child_collectibles where child_id = test_child and theme_code = 'COIN' and status = 'GROWING'
    ) then raise exception 'Collection stopped before six items'; end if;
  end loop;
  if exists (select 1 from public.child_collectibles where child_id = test_child and theme_code = 'COIN' and status = 'GROWING') then
    raise exception 'A growing item should not remain after completing the catalog';
  end if;

  insert into public.collectible_catalog (theme_code, code, name, growth_goal, sort_order, is_active)
  values ('COIN', 'DEV_COIN_07', 'Temporary seventh-item fixture', 24, 7, true);
  perform public.select_collection_theme('COIN');
  select catalog.code into strict current_code from public.child_collectibles item
  join public.collectible_catalog catalog on catalog.id = item.collectible_catalog_id
  where item.child_id = test_child and item.theme_code = 'COIN' and item.status = 'GROWING';
  if current_code <> 'DEV_COIN_07' then raise exception 'Seventh item could not be started'; end if;
end;
$$;
rollback;
select 'PASS six items can be collected; adding a seventh resumes collection; simulated changes rolled back' as result;
