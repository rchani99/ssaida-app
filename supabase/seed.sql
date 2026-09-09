-- Local development/test catalog only. Production catalog content belongs in a data migration.
insert into public.collectible_catalog (
  theme_code,
  code,
  name,
  growth_goal,
  sort_order,
  is_active
)
values
  ('DINO', 'DEV_DINO_01', '테스트 공룡 1', 1, 1, true),
  ('DINO', 'DEV_DINO_02', '테스트 공룡 2', 1, 2, true),
  ('DINO', 'DEV_DINO_03', '테스트 공룡 3', 1, 3, true),
  ('GEM', 'DEV_GEM_01', '테스트 보석 1', 1, 1, true),
  ('GEM', 'DEV_GEM_02', '테스트 보석 2', 1, 2, true),
  ('GEM', 'DEV_GEM_03', '테스트 보석 3', 1, 3, true),
  ('ROBOT', 'DEV_ROBOT_01', '테스트 로봇 1', 1, 1, true),
  ('ROBOT', 'DEV_ROBOT_02', '테스트 로봇 2', 1, 2, true),
  ('ROBOT', 'DEV_ROBOT_03', '테스트 로봇 3', 1, 3, true),
  ('DOLL', 'DEV_DOLL_01', '테스트 인형 1', 1, 1, true),
  ('DOLL', 'DEV_DOLL_02', '테스트 인형 2', 1, 2, true),
  ('DOLL', 'DEV_DOLL_03', '테스트 인형 3', 1, 3, true),
  ('COIN', 'DEV_COIN_01', '테스트 동전 1', 1, 1, true),
  ('COIN', 'DEV_COIN_02', '테스트 동전 2', 1, 2, true),
  ('COIN', 'DEV_COIN_03', '테스트 동전 3', 1, 3, true),
  ('PLANT', 'DEV_PLANT_01', '테스트 식물 1', 1, 1, true),
  ('PLANT', 'DEV_PLANT_02', '테스트 식물 2', 1, 2, true),
  ('PLANT', 'DEV_PLANT_03', '테스트 식물 3', 1, 3, true);
