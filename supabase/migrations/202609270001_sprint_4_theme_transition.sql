begin;

-- Sprint 4-1: gate cross-theme transitions; reward/reveal/pending logic is unchanged.
create or replace function public.select_collection_theme(target_theme_code text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_auth_user_id uuid := (select auth.uid());
  owned_child_id uuid;
  pending_points numeric(10, 6);
  current_theme_code text;
  has_unrevealed boolean;
  growing_collectible_id uuid;
  growing_progress numeric(10, 6);
  growing_goal numeric(10, 6);
  selected_catalog_id uuid;
  selected_growth_goal numeric(10, 6);
  next_sequence_no integer;
  applied_growth numeric(10, 6);
begin
  if current_auth_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if target_theme_code is null
    or target_theme_code <> all (
      array['DINO', 'GEM', 'ROBOT', 'DOLL', 'COIN', 'PLANT']::text[]
    ) then
    raise exception 'Unsupported collection theme' using errcode = '22023';
  end if;

  select c.id, c.pending_growth_points, c.selected_collection_theme_code
  into owned_child_id, pending_points, current_theme_code
  from public.children as c
  join public.profiles as p on p.id operator(pg_catalog.=) c.parent_id
  where p.auth_user_id operator(pg_catalog.=) current_auth_user_id
  for update of c;

  if not found then
    raise exception 'Child not found or access denied' using errcode = '42501';
  end if;

  -- The child lock serializes selection with reveal and parent confirmation.
  -- Same-theme calls keep the existing resume/pending semantics.
  -- Never delete or reset legacy progress in other themes.
  if current_theme_code is not null
    and current_theme_code is distinct from target_theme_code then
    if not exists (
      select 1 from public.collectible_catalog as catalog
      where catalog.theme_code operator(pg_catalog.=) current_theme_code
        and catalog.is_active
    ) or exists (
      select 1 from public.collectible_catalog as catalog
      where catalog.theme_code operator(pg_catalog.=) current_theme_code
        and catalog.is_active
        and not exists (
          select 1 from public.child_collectibles as owned
          where owned.child_id operator(pg_catalog.=) owned_child_id
            and owned.collectible_catalog_id operator(pg_catalog.=) catalog.id
            and owned.revealed_at is not null
        )
    ) then
      raise exception 'Reveal all active collectibles in the current theme before switching'
        using errcode = '22023';
    end if;
  end if;

  select exists (
    select 1
    from public.child_collectibles as waiting
    where waiting.child_id operator(pg_catalog.=) owned_child_id
      and waiting.theme_code operator(pg_catalog.=) target_theme_code
      and waiting.status operator(pg_catalog.=) 'COMPLETED'
      and waiting.revealed_at is null
  )
  into has_unrevealed;

  select growing.id, growing.progress_points, growing.growth_goal_snapshot
  into growing_collectible_id, growing_progress, growing_goal
  from public.child_collectibles as growing
  where growing.child_id operator(pg_catalog.=) owned_child_id
    and growing.theme_code operator(pg_catalog.=) target_theme_code
    and growing.status operator(pg_catalog.=) 'GROWING'
  for update;

  if growing_collectible_id is null and not has_unrevealed then
    select catalog.id, catalog.growth_goal
    into selected_catalog_id, selected_growth_goal
    from public.collectible_catalog as catalog
    where catalog.theme_code operator(pg_catalog.=) target_theme_code
      and catalog.is_active
      and not exists (
        select 1
        from public.child_collectibles as owned
        where owned.child_id operator(pg_catalog.=) owned_child_id
          and owned.collectible_catalog_id operator(pg_catalog.=) catalog.id
      )
    order by pg_catalog.random()
    limit 1;

    if selected_catalog_id is null then
      raise exception 'No active uncollected collectibles remain for this theme'
        using errcode = '22023';
    end if;

    select coalesce(pg_catalog.max(cc.sequence_no), 0) + 1
    into next_sequence_no
    from public.child_collectibles as cc
    where cc.child_id operator(pg_catalog.=) owned_child_id;

    insert into public.child_collectibles (
      child_id,
      theme_code,
      collectible_catalog_id,
      sequence_no,
      growth_goal_snapshot
    )
    values (
      owned_child_id,
      target_theme_code,
      selected_catalog_id,
      next_sequence_no,
      selected_growth_goal
    )
    returning id, progress_points, growth_goal_snapshot
    into growing_collectible_id, growing_progress, growing_goal;
  end if;

  update public.children as c
  set
    selected_collection_theme_code = target_theme_code,
    updated_at = pg_catalog.now()
  where c.id operator(pg_catalog.=) owned_child_id;

  if not has_unrevealed
    and growing_collectible_id is not null
    and pending_points operator(pg_catalog.>) 0 then
    applied_growth := least(pending_points, growing_goal - growing_progress);

    update public.child_collectibles as cc
    set
      progress_points = cc.progress_points + applied_growth,
      status = case
        when cc.progress_points + applied_growth operator(pg_catalog.>=) cc.growth_goal_snapshot
          then 'COMPLETED'
        else 'GROWING'
      end,
      completed_at = case
        when cc.progress_points + applied_growth operator(pg_catalog.>=) cc.growth_goal_snapshot
          then pg_catalog.now()
        else null
      end,
      updated_at = pg_catalog.now()
    where cc.id operator(pg_catalog.=) growing_collectible_id;

    update public.children as c
    set
      pending_growth_points = c.pending_growth_points - applied_growth,
      updated_at = pg_catalog.now()
    where c.id operator(pg_catalog.=) owned_child_id;

    insert into public.collectible_growth_events (
      child_collectible_id,
      daily_task_id,
      growth_points,
      source_type
    )
    values (growing_collectible_id, null, applied_growth, 'PENDING_APPLY');
  end if;
end;
$$;

revoke all on function public.select_collection_theme(text)
from public, anon, authenticated, service_role;
grant execute on function public.select_collection_theme(text) to authenticated;

commit;
