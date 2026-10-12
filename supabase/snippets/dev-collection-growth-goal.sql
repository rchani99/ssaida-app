-- DEV-only tuning for artwork verification. Run in the linked development SQL editor.
-- Keep earned points and completed/revealed collections intact.
-- Six points per visual stage also accommodates the existing ~4.93 stored points.
begin;

update public.collectible_catalog
set growth_goal = 24
where code ~ '^DEV_(DINO|GEM|ROBOT|DOLL|COIN|PLANT)_[0-9]{2,}$'
  and growth_goal in (1, 8);

-- Existing collections keep their original goal snapshot; update growing ones too.
update public.child_collectibles as item
set growth_goal_snapshot = 24,
    updated_at = now()
from public.collectible_catalog as catalog
where item.collectible_catalog_id = catalog.id
  and catalog.code ~ '^DEV_(DINO|GEM|ROBOT|DOLL|COIN|PLANT)_[0-9]{2,}$'
  and item.status = 'GROWING'
  and item.growth_goal_snapshot in (1, 8);

commit;

select theme_code, code, growth_goal
from public.collectible_catalog
where code ~ '^DEV_(DINO|GEM|ROBOT|DOLL|COIN|PLANT)_[0-9]{2,}$'
order by theme_code, sort_order;
