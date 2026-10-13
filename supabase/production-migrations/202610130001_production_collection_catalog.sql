-- Production catalog bootstrap, based on the supplied collection plan.
-- growth_goal = 24 was confirmed on 2026-10-13.
-- DINO names follow the bundled artwork; confirmed on 2026-10-13.
-- Standalone SQL, NOT automatically run by `supabase db push`.
-- Apply after schema migrations on a new production DB. For automated deployment,
-- first reconcile DEV catalog/seed behavior before adding to shared migrations.
-- Requires the existing collectible_catalog schema and an EMPTY catalog.
-- Existing DEV catalogs need a separate migration that preserves owned-item IDs;
-- do not delete DEV rows or combine this with the development seed.
-- All checks and inserts run as one atomic statement. Re-running fails explicitly.

do $catalog$
begin
  lock table public.collectible_catalog in share row exclusive mode;
  if exists (select 1 from public.collectible_catalog) then
    raise exception 'Catalog bootstrap requires an empty collectible_catalog; review existing data first.';
  end if;

  insert into public.collectible_catalog
    (code, name, growth_goal, theme_code, sort_order, is_active)
  values
    ('DINO_01', '티라노사우루스', 24, 'DINO', 1, true),
    ('DINO_02', '안킬로사우루스', 24, 'DINO', 2, true),
    ('DINO_03', '트리케라톱스', 24, 'DINO', 3, true),
    ('DINO_04', '프테라노돈', 24, 'DINO', 4, true),
    ('DINO_05', '브라키오사우루스', 24, 'DINO', 5, true),
    ('DINO_06', '스테고사우루스', 24, 'DINO', 6, true),
    ('GEM_01', '핑크젬', 24, 'GEM', 1, true),
    ('GEM_02', '블루젬', 24, 'GEM', 2, true),
    ('GEM_03', '스타젬', 24, 'GEM', 3, true),
    ('GEM_04', '그린젬', 24, 'GEM', 4, true),
    ('GEM_05', '하트젬', 24, 'GEM', 5, true),
    ('GEM_06', '레인보우젬', 24, 'GEM', 6, true),
    ('ROBOT_01', '루키', 24, 'ROBOT', 1, true),
    ('ROBOT_02', '네모', 24, 'ROBOT', 2, true),
    ('ROBOT_03', '핑코', 24, 'ROBOT', 3, true),
    ('ROBOT_04', '그린', 24, 'ROBOT', 4, true),
    ('ROBOT_05', '트랙이', 24, 'ROBOT', 5, true),
    ('ROBOT_06', '플라이', 24, 'ROBOT', 6, true),
    ('DOLL_01', '토끼 인형', 24, 'DOLL', 1, true),
    ('DOLL_02', '곰돌이 인형', 24, 'DOLL', 2, true),
    ('DOLL_03', '고양이 인형', 24, 'DOLL', 3, true),
    ('DOLL_04', '강아지 인형', 24, 'DOLL', 4, true),
    ('DOLL_05', '펭귄 인형', 24, 'DOLL', 5, true),
    ('DOLL_06', '양 인형', 24, 'DOLL', 6, true),
    ('COIN_01', '새싹 코인', 24, 'COIN', 1, true),
    ('COIN_02', '별 코인', 24, 'COIN', 2, true),
    ('COIN_03', '왕관 코인', 24, 'COIN', 3, true),
    ('COIN_04', '행운 코인', 24, 'COIN', 4, true),
    ('COIN_05', '하트 코인', 24, 'COIN', 5, true),
    ('COIN_06', '달 코인', 24, 'COIN', 6, true),
    ('PLANT_01', '새싹이', 24, 'PLANT', 1, true),
    ('PLANT_02', '선인장', 24, 'PLANT', 2, true),
    ('PLANT_03', '몬스테라', 24, 'PLANT', 3, true),
    ('PLANT_04', '클로버', 24, 'PLANT', 4, true),
    ('PLANT_05', '튤립', 24, 'PLANT', 5, true),
    ('PLANT_06', '해바라기', 24, 'PLANT', 6, true);
end;
$catalog$;
