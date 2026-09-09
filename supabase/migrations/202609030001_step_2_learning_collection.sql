begin;

-- Step 2 extends the Step 1 child record without rewriting migration history.
alter table public.children
  drop constraint children_daily_target_minutes_check;

alter table public.children
  alter column daily_target_minutes type smallint
    using daily_target_minutes::smallint,
  alter column daily_target_minutes set default 60,
  add column rest_weekdays smallint[] not null default '{}'::smallint[],
  add column selected_collection_theme_code text,
  add column pending_growth_points numeric(10, 6) not null default 0;

alter table public.children
  add constraint children_daily_target_minutes_check
    check (daily_target_minutes between 10 and 240),
  add constraint children_rest_weekdays_check
    check (
      pg_catalog.array_position(rest_weekdays, null) is null
      and rest_weekdays operator(pg_catalog.<@) array[1, 2, 3, 4, 5, 6, 7]::smallint[]
    ),
  add constraint children_selected_collection_theme_code_check
    check (
      selected_collection_theme_code is null
      or selected_collection_theme_code = any (
        array['DINO', 'GEM', 'ROBOT', 'DOLL', 'COIN', 'PLANT']::text[]
      )
    ),
  add constraint children_pending_growth_points_check
    check (pending_growth_points >= 0);

create index children_selected_collection_theme_code_idx
  on public.children (selected_collection_theme_code);

create table public.study_items (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  child_id uuid not null references public.children(id) on delete cascade,
  item_type text not null,
  name text not null,
  subject text,
  estimated_minutes smallint not null,
  study_weekdays smallint[] not null,
  workbook_pages_per_session smallint,
  workbook_last_page integer,
  workbook_last_completed_page integer,
  status text not null default 'ACTIVE',
  deleted_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint study_items_item_type_check
    check (item_type = any (array['WORKBOOK', 'ACTIVITY']::text[])),
  constraint study_items_subject_check
    check (
      subject is null
      or subject = any (
        array['KOREAN', 'MATH', 'ENGLISH', 'SCIENCE', 'SOCIAL', 'OTHER']::text[]
      )
    ),
  constraint study_items_estimated_minutes_check
    check (estimated_minutes > 0),
  constraint study_items_study_weekdays_check
    check (
      pg_catalog.cardinality(study_weekdays) > 0
      and pg_catalog.array_position(study_weekdays, null) is null
      and study_weekdays operator(pg_catalog.<@) array[1, 2, 3, 4, 5, 6, 7]::smallint[]
    ),
  constraint study_items_workbook_shape_check
    check (
      (
        item_type = 'WORKBOOK'
        and workbook_pages_per_session is not null
        and workbook_pages_per_session > 0
        and workbook_last_page is not null
        and workbook_last_page >= 1
        and workbook_last_completed_page is not null
        and workbook_last_completed_page >= 0
        and workbook_last_completed_page <= workbook_last_page
      )
      or (
        item_type = 'ACTIVITY'
        and workbook_pages_per_session is null
        and workbook_last_page is null
        and workbook_last_completed_page is null
      )
    ),
  constraint study_items_status_check
    check (status = any (array['ACTIVE', 'PAUSED', 'COMPLETED', 'DELETED']::text[])),
  constraint study_items_deleted_at_check
    check (
      (status = 'DELETED' and deleted_at is not null)
      or (status <> 'DELETED' and deleted_at is null)
    )
);

create index study_items_child_id_status_idx
  on public.study_items (child_id, status);

create table public.daily_plans (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  child_id uuid not null references public.children(id) on delete cascade,
  plan_date date not null,
  day_type text not null default 'STUDY',
  target_minutes_snapshot smallint not null,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint daily_plans_child_id_plan_date_key unique (child_id, plan_date),
  constraint daily_plans_day_type_check
    check (day_type = any (array['STUDY', 'REST']::text[])),
  constraint daily_plans_target_minutes_snapshot_check
    check (target_minutes_snapshot between 10 and 240)
);

create table public.daily_tasks (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  daily_plan_id uuid not null references public.daily_plans(id) on delete cascade,
  study_item_id uuid references public.study_items(id) on delete set null,
  source_daily_task_id uuid references public.daily_tasks(id) on delete set null,
  source_type text not null,
  item_type text not null,
  name_snapshot text not null,
  subject_snapshot text,
  reward_collection_theme_code text,
  planned_start_page integer,
  planned_end_page integer,
  planned_minutes smallint not null,
  actual_end_page integer,
  growth_weight numeric(10, 6) not null default 1,
  sort_order smallint not null,
  status text not null default 'PLANNED',
  verification_attempt_count smallint not null default 0,
  started_at timestamptz,
  child_completed_at timestamptz,
  parent_verified_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint daily_tasks_source_type_check
    check (source_type = any (array['AUTO', 'MANUAL', 'RESCHEDULED']::text[])),
  constraint daily_tasks_item_type_check
    check (item_type = any (array['WORKBOOK', 'ACTIVITY']::text[])),
  constraint daily_tasks_subject_snapshot_check
    check (
      subject_snapshot is null
      or subject_snapshot = any (
        array['KOREAN', 'MATH', 'ENGLISH', 'SCIENCE', 'SOCIAL', 'OTHER']::text[]
      )
    ),
  constraint daily_tasks_reward_collection_theme_code_check
    check (
      reward_collection_theme_code is null
      or reward_collection_theme_code = any (
        array['DINO', 'GEM', 'ROBOT', 'DOLL', 'COIN', 'PLANT']::text[]
      )
    ),
  constraint daily_tasks_page_shape_check
    check (
      (
        item_type = 'WORKBOOK'
        and planned_start_page is not null
        and planned_start_page >= 1
        and planned_end_page is not null
        and planned_end_page >= planned_start_page
        and (actual_end_page is null or actual_end_page >= planned_start_page)
      )
      or (
        item_type = 'ACTIVITY'
        and planned_start_page is null
        and planned_end_page is null
        and actual_end_page is null
      )
    ),
  constraint daily_tasks_planned_minutes_check
    check (planned_minutes > 0),
  constraint daily_tasks_growth_weight_check
    check (growth_weight > 0 and growth_weight <= 1),
  constraint daily_tasks_sort_order_check
    check (sort_order >= 0),
  constraint daily_tasks_status_check
    check (
      status = any (
        array[
          'PLANNED',
          'IN_PROGRESS',
          'CHILD_COMPLETED',
          'PARENT_CONFIRMED',
          'PARTIAL',
          'RETRY',
          'SKIPPED'
        ]::text[]
      )
    ),
  constraint daily_tasks_verification_attempt_count_check
    check (verification_attempt_count >= 0)
);

create index daily_tasks_daily_plan_id_sort_order_idx
  on public.daily_tasks (daily_plan_id, sort_order);

create index daily_tasks_study_item_id_idx
  on public.daily_tasks (study_item_id);

create index daily_tasks_status_idx
  on public.daily_tasks (status);

create index daily_tasks_unverified_completion_reminder_idx
  on public.daily_tasks (daily_plan_id, child_completed_at)
  where status = 'CHILD_COMPLETED'
    and parent_verified_at is null
    and child_completed_at is not null;

create unique index daily_tasks_auto_study_item_key
  on public.daily_tasks (daily_plan_id, study_item_id)
  where source_type = 'AUTO' and study_item_id is not null;

create unique index daily_tasks_source_daily_task_id_key
  on public.daily_tasks (source_daily_task_id)
  where source_daily_task_id is not null;

create table public.collectible_catalog (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  theme_code text not null,
  code text not null,
  name text not null,
  growth_goal numeric(10, 6) not null default 7,
  sort_order smallint not null,
  is_active boolean not null default true,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint collectible_catalog_theme_code_check
    check (theme_code = any (array['DINO', 'GEM', 'ROBOT', 'DOLL', 'COIN', 'PLANT']::text[])),
  constraint collectible_catalog_code_key unique (code),
  constraint collectible_catalog_id_theme_code_key unique (id, theme_code),
  constraint collectible_catalog_growth_goal_check
    check (growth_goal > 0)
);

create index collectible_catalog_theme_code_is_active_sort_order_idx
  on public.collectible_catalog (theme_code, is_active, sort_order);

create table public.child_collectibles (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  child_id uuid not null references public.children(id) on delete cascade,
  theme_code text not null,
  collectible_catalog_id uuid not null,
  sequence_no integer not null,
  status text not null default 'GROWING',
  progress_points numeric(10, 6) not null default 0,
  growth_goal_snapshot numeric(10, 6) not null,
  started_at timestamptz not null default pg_catalog.now(),
  completed_at timestamptz,
  revealed_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint child_collectibles_catalog_theme_fkey
    foreign key (collectible_catalog_id, theme_code)
    references public.collectible_catalog(id, theme_code)
    on delete restrict,
  constraint child_collectibles_child_id_sequence_no_key unique (child_id, sequence_no),
  constraint child_collectibles_child_id_catalog_id_key unique (child_id, collectible_catalog_id),
  constraint child_collectibles_theme_code_check
    check (theme_code = any (array['DINO', 'GEM', 'ROBOT', 'DOLL', 'COIN', 'PLANT']::text[])),
  constraint child_collectibles_status_check
    check (status = any (array['GROWING', 'COMPLETED']::text[])),
  constraint child_collectibles_progress_check
    check (
      progress_points >= 0
      and growth_goal_snapshot > 0
      and progress_points <= growth_goal_snapshot
    ),
  constraint child_collectibles_state_check
    check (
      (
        status = 'GROWING'
        and progress_points < growth_goal_snapshot
        and completed_at is null
        and revealed_at is null
      )
      or (
        status = 'COMPLETED'
        and progress_points = growth_goal_snapshot
        and completed_at is not null
      )
    )
);

create index child_collectibles_child_id_theme_code_idx
  on public.child_collectibles (child_id, theme_code);

-- Keep timestamps trustworthy for both direct owner updates and RPC writes.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

create trigger children_set_updated_at
before update on public.children
for each row execute function public.set_updated_at();

create trigger study_items_set_updated_at
before update on public.study_items
for each row execute function public.set_updated_at();

create trigger daily_plans_set_updated_at
before update on public.daily_plans
for each row execute function public.set_updated_at();

create trigger daily_tasks_set_updated_at
before update on public.daily_tasks
for each row execute function public.set_updated_at();

create trigger collectible_catalog_set_updated_at
before update on public.collectible_catalog
for each row execute function public.set_updated_at();

create trigger child_collectibles_set_updated_at
before update on public.child_collectibles
for each row execute function public.set_updated_at();

revoke all on function public.set_updated_at()
from public, anon, authenticated;

create unique index child_collectibles_one_growing_per_theme_key
  on public.child_collectibles (child_id, theme_code)
  where status = 'GROWING';

create table public.collectible_growth_events (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  child_collectible_id uuid not null references public.child_collectibles(id) on delete cascade,
  daily_task_id uuid references public.daily_tasks(id) on delete cascade,
  growth_points numeric(10, 6) not null,
  source_type text not null,
  created_at timestamptz not null default pg_catalog.now(),
  constraint collectible_growth_events_growth_points_check
    check (growth_points > 0),
  constraint collectible_growth_events_source_type_check
    check (source_type = any (array['DIRECT_TASK', 'PENDING_APPLY']::text[])),
  constraint collectible_growth_events_source_shape_check
    check (
      (source_type = 'DIRECT_TASK' and daily_task_id is not null)
      or (source_type = 'PENDING_APPLY' and daily_task_id is null)
    )
);

create index collectible_growth_events_child_collectible_id_idx
  on public.collectible_growth_events (child_collectible_id);

create unique index collectible_growth_events_direct_task_key
  on public.collectible_growth_events (daily_task_id, child_collectible_id)
  where daily_task_id is not null;

alter table public.study_items enable row level security;
alter table public.daily_plans enable row level security;
alter table public.daily_tasks enable row level security;
alter table public.collectible_catalog enable row level security;
alter table public.child_collectibles enable row level security;
alter table public.collectible_growth_events enable row level security;

revoke all on table public.study_items from public, anon, authenticated;
revoke all on table public.daily_plans from public, anon, authenticated;
revoke all on table public.daily_tasks from public, anon, authenticated;
revoke all on table public.collectible_catalog from public, anon, authenticated;
revoke all on table public.child_collectibles from public, anon, authenticated;
revoke all on table public.collectible_growth_events from public, anon, authenticated;

-- The Step 1 table-level UPDATE grant would expose the newly-added reward columns.
-- Keep normal settings editable while reserving theme/pending mutations for RPCs.
revoke update on table public.children from authenticated;
grant update (name, daily_target_minutes, rest_weekdays) on table public.children to authenticated;

grant select, insert on table public.study_items to authenticated;
grant update (
  name,
  subject,
  estimated_minutes,
  study_weekdays,
  workbook_pages_per_session,
  workbook_last_page,
  status,
  deleted_at,
  updated_at
) on table public.study_items to authenticated;

grant select on table public.daily_plans to authenticated;
grant select on table public.daily_tasks to authenticated;
grant select on table public.collectible_catalog to authenticated;
grant select on table public.child_collectibles to authenticated;
grant select on table public.collectible_growth_events to authenticated;

create policy "study_items_select_own"
on public.study_items for select
to authenticated
using (
  exists (
    select 1
    from public.children as c
    join public.profiles as p on p.id = c.parent_id
    where c.id = study_items.child_id
      and p.auth_user_id = (select auth.uid())
  )
);

create policy "study_items_insert_own"
on public.study_items for insert
to authenticated
with check (
  exists (
    select 1
    from public.children as c
    join public.profiles as p on p.id = c.parent_id
    where c.id = study_items.child_id
      and p.auth_user_id = (select auth.uid())
  )
);

create policy "study_items_update_own"
on public.study_items for update
to authenticated
using (
  exists (
    select 1
    from public.children as c
    join public.profiles as p on p.id = c.parent_id
    where c.id = study_items.child_id
      and p.auth_user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.children as c
    join public.profiles as p on p.id = c.parent_id
    where c.id = study_items.child_id
      and p.auth_user_id = (select auth.uid())
  )
);

create policy "daily_plans_select_own"
on public.daily_plans for select
to authenticated
using (
  exists (
    select 1
    from public.children as c
    join public.profiles as p on p.id = c.parent_id
    where c.id = daily_plans.child_id
      and p.auth_user_id = (select auth.uid())
  )
);

create policy "daily_tasks_select_own"
on public.daily_tasks for select
to authenticated
using (
  exists (
    select 1
    from public.daily_plans as dp
    join public.children as c on c.id = dp.child_id
    join public.profiles as p on p.id = c.parent_id
    where dp.id = daily_tasks.daily_plan_id
      and p.auth_user_id = (select auth.uid())
  )
);

create policy "collectible_catalog_select_authenticated"
on public.collectible_catalog for select
to authenticated
using (true);

create policy "child_collectibles_select_own"
on public.child_collectibles for select
to authenticated
using (
  exists (
    select 1
    from public.children as c
    join public.profiles as p on p.id = c.parent_id
    where c.id = child_collectibles.child_id
      and p.auth_user_id = (select auth.uid())
  )
);

create policy "collectible_growth_events_select_own"
on public.collectible_growth_events for select
to authenticated
using (
  exists (
    select 1
    from public.child_collectibles as cc
    join public.children as c on c.id = cc.child_id
    join public.profiles as p on p.id = c.parent_id
    where cc.id = collectible_growth_events.child_collectible_id
      and p.auth_user_id = (select auth.uid())
  )
);

create or replace function public.ensure_daily_plan(
  target_child_id uuid,
  target_plan_date date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_auth_user_id uuid := (select auth.uid());
  current_daily_target_minutes smallint;
  current_rest_weekdays smallint[];
  current_weekday smallint;
  calculated_day_type text;
  stored_day_type text;
  ensured_daily_plan_id uuid;
  first_sort_order integer;
begin
  if current_auth_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if target_child_id is null or target_plan_date is null then
    raise exception 'Child and plan date are required' using errcode = '22023';
  end if;

  select c.daily_target_minutes, c.rest_weekdays
  into current_daily_target_minutes, current_rest_weekdays
  from public.children as c
  join public.profiles as p on p.id operator(pg_catalog.=) c.parent_id
  where c.id operator(pg_catalog.=) target_child_id
    and p.auth_user_id operator(pg_catalog.=) current_auth_user_id
  for update of c;

  if not found then
    raise exception 'Child not found or access denied' using errcode = '42501';
  end if;

  current_weekday := pg_catalog.date_part('isodow', target_plan_date)::smallint;
  calculated_day_type := case
    when current_weekday operator(pg_catalog.=) any (current_rest_weekdays) then 'REST'
    else 'STUDY'
  end;

  insert into public.daily_plans (
    child_id,
    plan_date,
    day_type,
    target_minutes_snapshot
  )
  values (
    target_child_id,
    target_plan_date,
    calculated_day_type,
    current_daily_target_minutes
  )
  on conflict (child_id, plan_date) do update
    set child_id = excluded.child_id
  returning id, day_type into ensured_daily_plan_id, stored_day_type;

  if stored_day_type operator(pg_catalog.=) 'REST' then
    return ensured_daily_plan_id;
  end if;

  select coalesce(pg_catalog.max(dt.sort_order)::integer + 1, 0)
  into first_sort_order
  from public.daily_tasks as dt
  where dt.daily_plan_id operator(pg_catalog.=) ensured_daily_plan_id;

  with candidate_items as (
    select
      si.*,
      case
        when si.item_type operator(pg_catalog.=) 'WORKBOOK' then greatest(
          si.workbook_last_completed_page,
          coalesce(
            (
              select pg_catalog.max(previous_task.planned_end_page)
              from public.daily_tasks as previous_task
              join public.daily_plans as previous_plan
                on previous_plan.id operator(pg_catalog.=) previous_task.daily_plan_id
              where previous_task.study_item_id operator(pg_catalog.=) si.id
                and previous_task.source_type operator(pg_catalog.=) 'AUTO'
                and previous_task.status operator(pg_catalog.=) 'CHILD_COMPLETED'
                and previous_task.parent_verified_at is null
                and previous_plan.plan_date operator(pg_catalog.<) target_plan_date
            ),
            si.workbook_last_completed_page
          )
        )
        else null
      end as planning_progress
    from public.study_items as si
    where si.child_id operator(pg_catalog.=) target_child_id
      and si.status operator(pg_catalog.=) 'ACTIVE'
      and current_weekday operator(pg_catalog.=) any (si.study_weekdays)
      and not exists (
        select 1
        from public.daily_tasks as continuing_task
        join public.daily_plans as continuing_plan
          on continuing_plan.id operator(pg_catalog.=) continuing_task.daily_plan_id
        where continuing_task.study_item_id operator(pg_catalog.=) si.id
          and continuing_task.source_type operator(pg_catalog.=) 'AUTO'
          and continuing_task.status operator(pg_catalog.=) any (
            array['IN_PROGRESS', 'RETRY']::text[]
          )
          and continuing_plan.plan_date operator(pg_catalog.<) target_plan_date
      )
  ),
  eligible_items as (
    select
      candidate_items.*,
      pg_catalog.row_number() over (
        order by candidate_items.created_at, candidate_items.id
      ) as item_rank
    from candidate_items
    where candidate_items.item_type operator(pg_catalog.=) 'ACTIVITY'
      or candidate_items.planning_progress operator(pg_catalog.<) candidate_items.workbook_last_page
  )
  insert into public.daily_tasks (
    daily_plan_id,
    study_item_id,
    source_type,
    item_type,
    name_snapshot,
    subject_snapshot,
    planned_start_page,
    planned_end_page,
    planned_minutes,
    growth_weight,
    sort_order
  )
  select
    ensured_daily_plan_id,
    ei.id,
    'AUTO',
    ei.item_type,
    ei.name,
    ei.subject,
    case
      when ei.item_type operator(pg_catalog.=) 'WORKBOOK'
        then ei.planning_progress + 1
      else null
    end,
    case
      when ei.item_type operator(pg_catalog.=) 'WORKBOOK'
        then least(
          ei.planning_progress + ei.workbook_pages_per_session,
          ei.workbook_last_page
        )
      else null
    end,
    ei.estimated_minutes,
    1,
    (first_sort_order + ei.item_rank - 1)::smallint
  from eligible_items as ei
  on conflict (daily_plan_id, study_item_id)
    where source_type = 'AUTO' and study_item_id is not null
    do nothing;

  return ensured_daily_plan_id;
end;
$$;

create or replace function public.start_daily_task(target_daily_task_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_auth_user_id uuid := (select auth.uid());
  owned_child_id uuid;
  current_status text;
begin
  if current_auth_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if target_daily_task_id is null then
    raise exception 'Daily task is required' using errcode = '22023';
  end if;

  select dp.child_id
  into owned_child_id
  from public.daily_tasks as dt
  join public.daily_plans as dp on dp.id operator(pg_catalog.=) dt.daily_plan_id
  join public.children as c on c.id operator(pg_catalog.=) dp.child_id
  join public.profiles as p on p.id operator(pg_catalog.=) c.parent_id
  where dt.id operator(pg_catalog.=) target_daily_task_id
    and p.auth_user_id operator(pg_catalog.=) current_auth_user_id;

  if not found then
    raise exception 'Task not found or access denied' using errcode = '42501';
  end if;

  perform 1 from public.children as c
  where c.id operator(pg_catalog.=) owned_child_id
  for update;

  select dt.status into current_status
  from public.daily_tasks as dt
  join public.daily_plans as dp on dp.id operator(pg_catalog.=) dt.daily_plan_id
  where dt.id operator(pg_catalog.=) target_daily_task_id
    and dp.child_id operator(pg_catalog.=) owned_child_id
  for update of dt;

  if current_status operator(pg_catalog.=) 'IN_PROGRESS' then
    return;
  end if;
  if current_status <> all (array['PLANNED', 'RETRY']::text[]) then
    raise exception 'Only planned or retry tasks can be started' using errcode = '22023';
  end if;

  update public.daily_tasks as dt
  set status = 'IN_PROGRESS',
      started_at = coalesce(dt.started_at, pg_catalog.now()),
      parent_verified_at = case
        when current_status operator(pg_catalog.=) 'RETRY' then null
        else dt.parent_verified_at
      end,
      child_completed_at = case
        when current_status operator(pg_catalog.=) 'RETRY' then null
        else dt.child_completed_at
      end,
      reward_collection_theme_code = case
        when current_status operator(pg_catalog.=) 'RETRY' then null
        else dt.reward_collection_theme_code
      end,
      actual_end_page = case
        when current_status operator(pg_catalog.=) 'RETRY' then null
        else dt.actual_end_page
      end,
      updated_at = pg_catalog.now()
  where dt.id operator(pg_catalog.=) target_daily_task_id;
end;
$$;

create or replace function public.complete_daily_task(target_daily_task_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_auth_user_id uuid := (select auth.uid());
  owned_child_id uuid;
  selected_theme text;
  current_status text;
begin
  if current_auth_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if target_daily_task_id is null then
    raise exception 'Daily task is required' using errcode = '22023';
  end if;

  select dp.child_id into owned_child_id
  from public.daily_tasks as dt
  join public.daily_plans as dp on dp.id operator(pg_catalog.=) dt.daily_plan_id
  join public.children as c on c.id operator(pg_catalog.=) dp.child_id
  join public.profiles as p on p.id operator(pg_catalog.=) c.parent_id
  where dt.id operator(pg_catalog.=) target_daily_task_id
    and p.auth_user_id operator(pg_catalog.=) current_auth_user_id;
  if not found then
    raise exception 'Task not found or access denied' using errcode = '42501';
  end if;

  select c.selected_collection_theme_code into selected_theme
  from public.children as c
  where c.id operator(pg_catalog.=) owned_child_id
  for update;

  select dt.status into current_status
  from public.daily_tasks as dt
  join public.daily_plans as dp on dp.id operator(pg_catalog.=) dt.daily_plan_id
  where dt.id operator(pg_catalog.=) target_daily_task_id
    and dp.child_id operator(pg_catalog.=) owned_child_id
  for update of dt;

  if current_status operator(pg_catalog.=) 'CHILD_COMPLETED' then
    return;
  end if;
  if current_status operator(pg_catalog.<>) 'IN_PROGRESS' then
    raise exception 'Only in-progress tasks can be completed' using errcode = '22023';
  end if;

  update public.daily_tasks as dt
  set status = 'CHILD_COMPLETED',
      child_completed_at = pg_catalog.now(),
      reward_collection_theme_code = selected_theme,
      updated_at = pg_catalog.now()
  where dt.id operator(pg_catalog.=) target_daily_task_id;
end;
$$;

create or replace function public.undo_daily_task_completion(target_daily_task_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_auth_user_id uuid := (select auth.uid());
  owned_child_id uuid;
  task_status text;
  task_parent_verified_at timestamptz;
begin
  if current_auth_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select dp.child_id into owned_child_id
  from public.daily_tasks as dt
  join public.daily_plans as dp on dp.id operator(pg_catalog.=) dt.daily_plan_id
  join public.children as c on c.id operator(pg_catalog.=) dp.child_id
  join public.profiles as p on p.id operator(pg_catalog.=) c.parent_id
  where dt.id operator(pg_catalog.=) target_daily_task_id
    and p.auth_user_id operator(pg_catalog.=) current_auth_user_id;
  if not found then
    raise exception 'Task not found or access denied' using errcode = '42501';
  end if;

  perform 1 from public.children as c where c.id operator(pg_catalog.=) owned_child_id for update;
  select dt.status, dt.parent_verified_at into task_status, task_parent_verified_at
  from public.daily_tasks as dt
  join public.daily_plans as dp on dp.id operator(pg_catalog.=) dt.daily_plan_id
  where dt.id operator(pg_catalog.=) target_daily_task_id
    and dp.child_id operator(pg_catalog.=) owned_child_id
  for update of dt;

  if task_status operator(pg_catalog.=) 'IN_PROGRESS' and task_parent_verified_at is null then
    return;
  end if;
  if task_status operator(pg_catalog.<>) 'CHILD_COMPLETED' or task_parent_verified_at is not null then
    raise exception 'Only unverified child completions can be undone' using errcode = '22023';
  end if;

  update public.daily_tasks
  set status = 'IN_PROGRESS', child_completed_at = null,
      reward_collection_theme_code = null, updated_at = pg_catalog.now()
  where id operator(pg_catalog.=) target_daily_task_id;
end;
$$;

create or replace function public.add_manual_daily_task(
  target_child_id uuid,
  target_plan_date date,
  manual_item_type text,
  manual_name text,
  manual_subject text,
  manual_planned_start_page integer,
  manual_planned_end_page integer,
  manual_planned_minutes smallint
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_auth_user_id uuid := (select auth.uid());
  target_daily_plan_id uuid;
  next_sort_order integer;
  created_task_id uuid;
begin
  if current_auth_user_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if target_child_id is null or target_plan_date is null or manual_name is null
    or pg_catalog.btrim(manual_name) operator(pg_catalog.=) '' then
    raise exception 'Child, plan date, and name are required' using errcode = '22023';
  end if;
  if manual_item_type <> all (array['WORKBOOK', 'ACTIVITY']::text[])
    or (manual_subject is not null and manual_subject <> all (array['KOREAN','MATH','ENGLISH','SCIENCE','SOCIAL','OTHER']::text[]))
    or manual_planned_minutes is null or manual_planned_minutes operator(pg_catalog.<=) 0 then
    raise exception 'Invalid manual task values' using errcode = '22023';
  end if;
  if (manual_item_type operator(pg_catalog.=) 'WORKBOOK' and
      (manual_planned_start_page is null or manual_planned_end_page is null or manual_planned_start_page operator(pg_catalog.<) 1 or manual_planned_end_page operator(pg_catalog.<) manual_planned_start_page))
    or (manual_item_type operator(pg_catalog.=) 'ACTIVITY' and (manual_planned_start_page is not null or manual_planned_end_page is not null)) then
    raise exception 'Invalid page range for item type' using errcode = '22023';
  end if;

  perform 1 from public.children as c join public.profiles as p on p.id operator(pg_catalog.=) c.parent_id
  where c.id operator(pg_catalog.=) target_child_id and p.auth_user_id operator(pg_catalog.=) current_auth_user_id
  for update of c;
  if not found then raise exception 'Child not found or access denied' using errcode = '42501'; end if;

  target_daily_plan_id := public.ensure_daily_plan(target_child_id, target_plan_date);
  perform 1 from public.daily_plans as dp where dp.id operator(pg_catalog.=) target_daily_plan_id for update;
  select coalesce(pg_catalog.max(dt.sort_order) + 1, 0) into next_sort_order
  from public.daily_tasks as dt where dt.daily_plan_id operator(pg_catalog.=) target_daily_plan_id;

  insert into public.daily_tasks (daily_plan_id, study_item_id, source_daily_task_id, source_type,
    item_type, name_snapshot, subject_snapshot, reward_collection_theme_code,
    planned_start_page, planned_end_page, planned_minutes, actual_end_page,
    growth_weight, sort_order, status)
  values (target_daily_plan_id, null, null, 'MANUAL', manual_item_type, pg_catalog.btrim(manual_name),
    manual_subject, null, manual_planned_start_page, manual_planned_end_page,
    manual_planned_minutes, null, 1, next_sort_order, 'PLANNED')
  returning id into created_task_id;
  return created_task_id;
end;
$$;

create or replace function public.reschedule_manual_task(
  source_daily_task_id uuid,
  target_plan_date date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  current_auth_user_id uuid := (select auth.uid());
  owned_child_id uuid;
  source_task record;
  existing_rescheduled_task_id uuid;
  existing_target_plan_date date;
  target_daily_plan_id uuid;
  next_sort_order integer;
  created_task_id uuid;
begin
  if current_auth_user_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if reschedule_manual_task.source_daily_task_id is null or target_plan_date is null then
    raise exception 'Source task and target date are required' using errcode = '22023';
  end if;

  select dp.child_id into owned_child_id
  from public.daily_tasks dt join public.daily_plans dp on dp.id operator(pg_catalog.=) dt.daily_plan_id
  join public.children c on c.id operator(pg_catalog.=) dp.child_id
  join public.profiles p on p.id operator(pg_catalog.=) c.parent_id
  where dt.id operator(pg_catalog.=) reschedule_manual_task.source_daily_task_id
    and p.auth_user_id operator(pg_catalog.=) current_auth_user_id;
  if not found then raise exception 'Task not found or access denied' using errcode = '42501'; end if;

  perform 1 from public.children c where c.id operator(pg_catalog.=) owned_child_id for update;
  select dt.* into source_task
  from public.daily_tasks dt join public.daily_plans dp on dp.id operator(pg_catalog.=) dt.daily_plan_id
  where dt.id operator(pg_catalog.=) reschedule_manual_task.source_daily_task_id
    and dp.child_id operator(pg_catalog.=) owned_child_id
  for update of dt;

  if source_task.source_type <> all (array['MANUAL','RESCHEDULED']::text[])
    or source_task.status <> all (array['PLANNED','IN_PROGRESS','RETRY']::text[]) then
    raise exception 'Only unresolved manual tasks can be rescheduled' using errcode = '22023';
  end if;

  select rescheduled.id, rescheduled_plan.plan_date
  into existing_rescheduled_task_id, existing_target_plan_date
  from public.daily_tasks as rescheduled
  join public.daily_plans as rescheduled_plan
    on rescheduled_plan.id operator(pg_catalog.=) rescheduled.daily_plan_id
  where rescheduled.source_daily_task_id
    operator(pg_catalog.=) reschedule_manual_task.source_daily_task_id
  for update of rescheduled;

  if existing_rescheduled_task_id is not null then
    if existing_target_plan_date operator(pg_catalog.=) target_plan_date then
      return existing_rescheduled_task_id;
    end if;

    raise exception 'This task has already been rescheduled to another date'
      using errcode = '22023';
  end if;

  target_daily_plan_id := public.ensure_daily_plan(owned_child_id, target_plan_date);
  perform 1 from public.daily_plans dp where dp.id operator(pg_catalog.=) target_daily_plan_id for update;
  select coalesce(pg_catalog.max(dt.sort_order) + 1, 0) into next_sort_order
  from public.daily_tasks dt where dt.daily_plan_id operator(pg_catalog.=) target_daily_plan_id;

  insert into public.daily_tasks (daily_plan_id, study_item_id, source_daily_task_id, source_type,
    item_type, name_snapshot, subject_snapshot, reward_collection_theme_code,
    planned_start_page, planned_end_page, planned_minutes, actual_end_page,
    growth_weight, sort_order, status)
  values (target_daily_plan_id, null, reschedule_manual_task.source_daily_task_id, 'RESCHEDULED', source_task.item_type,
    source_task.name_snapshot, source_task.subject_snapshot, null, source_task.planned_start_page,
    source_task.planned_end_page, source_task.planned_minutes, null, source_task.growth_weight,
    next_sort_order, 'PLANNED')
  returning id into created_task_id;
  return created_task_id;
end;
$$;

create or replace function public.skip_manual_task(target_daily_task_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_auth_user_id uuid := (select auth.uid());
  owned_child_id uuid;
  task_record record;
begin
  if current_auth_user_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select dp.child_id into owned_child_id
  from public.daily_tasks dt join public.daily_plans dp on dp.id operator(pg_catalog.=) dt.daily_plan_id
  join public.children c on c.id operator(pg_catalog.=) dp.child_id
  join public.profiles p on p.id operator(pg_catalog.=) c.parent_id
  where dt.id operator(pg_catalog.=) target_daily_task_id
    and p.auth_user_id operator(pg_catalog.=) current_auth_user_id;
  if not found then raise exception 'Task not found or access denied' using errcode = '42501'; end if;

  perform 1 from public.children c where c.id operator(pg_catalog.=) owned_child_id for update;
  select dt.source_type, dt.status into task_record
  from public.daily_tasks dt join public.daily_plans dp on dp.id operator(pg_catalog.=) dt.daily_plan_id
  where dt.id operator(pg_catalog.=) target_daily_task_id and dp.child_id operator(pg_catalog.=) owned_child_id
  for update of dt;

  if task_record.source_type <> all (array['MANUAL','RESCHEDULED']::text[]) then
    raise exception 'AUTO tasks cannot be skipped through this operation' using errcode = '22023';
  end if;
  if task_record.status operator(pg_catalog.=) 'SKIPPED' then return; end if;
  if task_record.status = any (array['PARENT_CONFIRMED','PARTIAL']::text[]) then
    raise exception 'A finalized task cannot be skipped' using errcode = '22023';
  end if;

  update public.daily_tasks dt
  set status = 'SKIPPED', verification_attempt_count = dt.verification_attempt_count + 1,
      parent_verified_at = pg_catalog.now(), updated_at = pg_catalog.now()
  where dt.id operator(pg_catalog.=) target_daily_task_id;
end;
$$;

create or replace function public.confirm_daily_tasks(task_confirmations jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_auth_user_id uuid := (select auth.uid());
  input_count integer;
  matched_count integer;
  matched_child_count integer;
  owned_child_id uuid;
  confirmation record;
  task_record record;
  recognized_growth numeric(10, 6);
  recognized_pages integer;
  planned_pages integer;
  effective_start_page integer;
  recognized_end_page integer;
  locked_study_item_type text;
  locked_workbook_pages_per_session smallint;
  locked_workbook_last_page integer;
  locked_workbook_last_completed_page integer;
  confirmed_progress_after integer;
  recalculation_cursor integer;
  recalculated_end_page integer;
  future_task record;
  has_unrevealed boolean;
  growing_collectible_id uuid;
  growing_progress numeric(10, 6);
  growing_goal numeric(10, 6);
  applied_growth numeric(10, 6);
  overflow_growth numeric(10, 6);
begin
  if current_auth_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if task_confirmations is null
    or pg_catalog.jsonb_typeof(task_confirmations) is distinct from 'array'
    or pg_catalog.jsonb_array_length(task_confirmations) = 0 then
    raise exception 'Task confirmations must be a non-empty JSON array' using errcode = '22023';
  end if;

  select pg_catalog.count(*)::integer
  into input_count
  from pg_catalog.jsonb_to_recordset(task_confirmations)
    as input(daily_task_id uuid, status text, actual_end_page integer);

  if exists (
    select 1
    from pg_catalog.jsonb_to_recordset(task_confirmations)
      as input(daily_task_id uuid, status text, actual_end_page integer)
    where input.daily_task_id is null or input.status is null
  ) then
    raise exception 'Each confirmation requires daily_task_id and status' using errcode = '22023';
  end if;

  if (
    select pg_catalog.count(distinct input.daily_task_id)
    from pg_catalog.jsonb_to_recordset(task_confirmations)
      as input(daily_task_id uuid, status text, actual_end_page integer)
  ) operator(pg_catalog.<>) input_count then
    raise exception 'Each task may appear only once per confirmation batch' using errcode = '22023';
  end if;

  select
    pg_catalog.count(*)::integer,
    pg_catalog.count(distinct dp.child_id)::integer,
    (pg_catalog.array_agg(distinct dp.child_id))[1]
  into matched_count, matched_child_count, owned_child_id
  from pg_catalog.jsonb_to_recordset(task_confirmations)
    as input(daily_task_id uuid, status text, actual_end_page integer)
  join public.daily_tasks as dt on dt.id operator(pg_catalog.=) input.daily_task_id
  join public.daily_plans as dp on dp.id operator(pg_catalog.=) dt.daily_plan_id
  join public.children as c on c.id operator(pg_catalog.=) dp.child_id
  join public.profiles as p on p.id operator(pg_catalog.=) c.parent_id
  where p.auth_user_id operator(pg_catalog.=) current_auth_user_id;

  if matched_count operator(pg_catalog.<>) input_count then
    raise exception 'Task not found or access denied' using errcode = '42501';
  end if;
  if matched_child_count operator(pg_catalog.<>) 1 then
    raise exception 'A confirmation batch must belong to one child' using errcode = '22023';
  end if;

  -- All collection/progress RPCs lock the child first, giving a consistent lock order.
  perform 1
  from public.children as c
  where c.id operator(pg_catalog.=) owned_child_id
  for update;

  for confirmation in
    select input.daily_task_id, input.status, input.actual_end_page
    from pg_catalog.jsonb_to_recordset(task_confirmations)
      as input(daily_task_id uuid, status text, actual_end_page integer)
    order by input.daily_task_id
  loop
    if confirmation.status <> all (array['PARENT_CONFIRMED', 'PARTIAL', 'RETRY']::text[]) then
      raise exception 'Unsupported parent confirmation status' using errcode = '22023';
    end if;

    select
      dt.*,
      dp.child_id,
      dp.plan_date,
      si.child_id as study_item_child_id
    into task_record
    from public.daily_tasks as dt
    join public.daily_plans as dp on dp.id operator(pg_catalog.=) dt.daily_plan_id
    left join public.study_items as si on si.id operator(pg_catalog.=) dt.study_item_id
    where dt.id operator(pg_catalog.=) confirmation.daily_task_id
      and dp.child_id operator(pg_catalog.=) owned_child_id
    for update of dt;

    if task_record.status = any (array['PARENT_CONFIRMED', 'PARTIAL', 'RETRY']::text[]) then
      if task_record.status operator(pg_catalog.=) confirmation.status
        and task_record.actual_end_page is not distinct from confirmation.actual_end_page then
        continue;
      end if;
      raise exception 'Task has already been finalized' using errcode = '22023';
    end if;

    if task_record.status operator(pg_catalog.<>) 'CHILD_COMPLETED' then
      raise exception 'Only child-completed tasks can be confirmed' using errcode = '22023';
    end if;

    if task_record.item_type operator(pg_catalog.=) 'WORKBOOK' then
      if confirmation.status operator(pg_catalog.=) 'RETRY' then
        if confirmation.actual_end_page is not null then
          raise exception 'RETRY must not include an actual end page' using errcode = '22023';
        end if;
      elsif confirmation.actual_end_page is null then
        raise exception 'Workbook confirmation requires an actual end page' using errcode = '22023';
      elsif confirmation.status operator(pg_catalog.=) 'PARTIAL'
        and (
          confirmation.actual_end_page operator(pg_catalog.<) task_record.planned_start_page
          or confirmation.actual_end_page operator(pg_catalog.>=) task_record.planned_end_page
        ) then
        raise exception 'PARTIAL end page must be inside the planned range' using errcode = '22023';
      elsif confirmation.status operator(pg_catalog.=) 'PARENT_CONFIRMED'
        and confirmation.actual_end_page operator(pg_catalog.<) task_record.planned_end_page then
        raise exception 'PARENT_CONFIRMED must reach the planned end page' using errcode = '22023';
      end if;

      if task_record.study_item_id is not null then
        select
          si.item_type,
          si.workbook_pages_per_session,
          si.workbook_last_page,
          si.workbook_last_completed_page
        into
          locked_study_item_type,
          locked_workbook_pages_per_session,
          locked_workbook_last_page,
          locked_workbook_last_completed_page
        from public.study_items as si
        where si.id operator(pg_catalog.=) task_record.study_item_id
          and si.child_id operator(pg_catalog.=) owned_child_id
        for update;

        if not found
          or task_record.study_item_child_id is distinct from owned_child_id
          or locked_study_item_type is distinct from 'WORKBOOK' then
          raise exception 'Workbook task does not match its study item' using errcode = '22023';
        end if;
        if confirmation.actual_end_page is not null
          and confirmation.actual_end_page operator(pg_catalog.>) locked_workbook_last_page then
          raise exception 'Actual end page exceeds the workbook last page' using errcode = '22023';
        end if;
      end if;
    else
      if confirmation.actual_end_page is not null then
        raise exception 'Activity confirmation must not include a page' using errcode = '22023';
      end if;
      if confirmation.status operator(pg_catalog.=) 'PARTIAL' then
        raise exception 'Activity partial-time confirmation is outside MVP scope' using errcode = '22023';
      end if;
    end if;

    recognized_growth := 0;
    if confirmation.status operator(pg_catalog.<>) 'RETRY' then
      if task_record.item_type operator(pg_catalog.=) 'WORKBOOK' then
        planned_pages := task_record.planned_end_page - task_record.planned_start_page + 1;
        if task_record.study_item_id is not null then
          -- A late confirmation may overlap progress confirmed by a newer task.
          -- Reward only pages that advance the locked canonical workbook progress.
          effective_start_page := greatest(
            task_record.planned_start_page,
            locked_workbook_last_completed_page + 1
          );
          recognized_end_page := least(confirmation.actual_end_page, task_record.planned_end_page);
          recognized_pages := greatest(recognized_end_page - effective_start_page + 1, 0);
        else
          -- One-time manual workbooks have no canonical StudyItem progress row.
          recognized_pages := greatest(
            least(confirmation.actual_end_page, task_record.planned_end_page)
              - task_record.planned_start_page + 1,
            0
          );
        end if;
        recognized_growth := (
          task_record.growth_weight * recognized_pages::numeric / planned_pages::numeric
        )::numeric(10, 6);
      else
        recognized_growth := task_record.growth_weight;
      end if;
    end if;

    if task_record.item_type operator(pg_catalog.=) 'WORKBOOK'
      and task_record.study_item_id is not null
      and confirmation.actual_end_page is not null then
      update public.study_items as si
      set
        workbook_last_completed_page = confirmation.actual_end_page,
        status = case
          when confirmation.actual_end_page operator(pg_catalog.=) si.workbook_last_page
            and si.status operator(pg_catalog.<>) 'DELETED'
            then 'COMPLETED'
          else si.status
        end,
        updated_at = pg_catalog.now()
      where si.id operator(pg_catalog.=) task_record.study_item_id
        and si.child_id operator(pg_catalog.=) owned_child_id
        and confirmation.actual_end_page operator(pg_catalog.>) si.workbook_last_completed_page;

      confirmed_progress_after := greatest(
        locked_workbook_last_completed_page,
        confirmation.actual_end_page
      );
      recalculation_cursor := confirmed_progress_after;

      -- A late confirmation can invalidate temporary ranges generated from an
      -- unverified child completion. Recalculate only untouched future AUTO
      -- tasks. Delete one only when the confirmed cursor has reached the end
      -- of the workbook; started/finalized snapshots remain immutable and
      -- advance the cursor so later PLANNED ranges do not overlap them.
      for future_task in
        select
          future.id,
          future.status,
          future.planned_start_page,
          future.planned_end_page
        from public.daily_tasks as future
        join public.daily_plans as future_plan
          on future_plan.id operator(pg_catalog.=) future.daily_plan_id
        where future.study_item_id operator(pg_catalog.=) task_record.study_item_id
          and future.source_type operator(pg_catalog.=) 'AUTO'
          and future.item_type operator(pg_catalog.=) 'WORKBOOK'
          and future_plan.plan_date operator(pg_catalog.>) task_record.plan_date
        order by future_plan.plan_date, future.created_at, future.id
        for update of future
      loop
        if future_task.status operator(pg_catalog.=) 'PLANNED' then
          if recalculation_cursor operator(pg_catalog.<) locked_workbook_last_page then
            recalculated_end_page := least(
              recalculation_cursor + locked_workbook_pages_per_session,
              locked_workbook_last_page
            );

            update public.daily_tasks as future
            set
              planned_start_page = recalculation_cursor + 1,
              planned_end_page = recalculated_end_page,
              updated_at = pg_catalog.now()
            where future.id operator(pg_catalog.=) future_task.id;

            recalculation_cursor := recalculated_end_page;
          else
            delete from public.daily_tasks as future
            where future.id operator(pg_catalog.=) future_task.id;
          end if;
        else
          recalculation_cursor := greatest(
            recalculation_cursor,
            future_task.planned_end_page
          );
        end if;
      end loop;
    end if;

    if recognized_growth operator(pg_catalog.>) 0 then
      if task_record.reward_collection_theme_code is null then
        update public.children as c
        set
          pending_growth_points = c.pending_growth_points + recognized_growth,
          updated_at = pg_catalog.now()
        where c.id operator(pg_catalog.=) owned_child_id;
      else
        select exists (
          select 1
          from public.child_collectibles as waiting
          where waiting.child_id operator(pg_catalog.=) owned_child_id
            and waiting.theme_code operator(pg_catalog.=) task_record.reward_collection_theme_code
            and waiting.status operator(pg_catalog.=) 'COMPLETED'
            and waiting.revealed_at is null
        )
        into has_unrevealed;

        growing_collectible_id := null;
        if not has_unrevealed then
          select growing.id, growing.progress_points, growing.growth_goal_snapshot
          into growing_collectible_id, growing_progress, growing_goal
          from public.child_collectibles as growing
          where growing.child_id operator(pg_catalog.=) owned_child_id
            and growing.theme_code operator(pg_catalog.=) task_record.reward_collection_theme_code
            and growing.status operator(pg_catalog.=) 'GROWING'
          for update;
        end if;

        if growing_collectible_id is null then
          update public.children as c
          set
            pending_growth_points = c.pending_growth_points + recognized_growth,
            updated_at = pg_catalog.now()
          where c.id operator(pg_catalog.=) owned_child_id;
        else
          applied_growth := least(recognized_growth, growing_goal - growing_progress);
          overflow_growth := recognized_growth - applied_growth;

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

          insert into public.collectible_growth_events (
            child_collectible_id,
            daily_task_id,
            growth_points,
            source_type
          )
          values (
            growing_collectible_id,
            task_record.id,
            applied_growth,
            'DIRECT_TASK'
          );

          if overflow_growth operator(pg_catalog.>) 0 then
            update public.children as c
            set
              pending_growth_points = c.pending_growth_points + overflow_growth,
              updated_at = pg_catalog.now()
            where c.id operator(pg_catalog.=) owned_child_id;
          end if;
        end if;
      end if;
    end if;

    update public.daily_tasks as dt
    set
      status = confirmation.status,
      actual_end_page = confirmation.actual_end_page,
      verification_attempt_count = dt.verification_attempt_count + 1,
      parent_verified_at = pg_catalog.now(),
      updated_at = pg_catalog.now()
    where dt.id operator(pg_catalog.=) task_record.id;
  end loop;
end;
$$;

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

  select c.id, c.pending_growth_points
  into owned_child_id, pending_points
  from public.children as c
  join public.profiles as p on p.id operator(pg_catalog.=) c.parent_id
  where p.auth_user_id operator(pg_catalog.=) current_auth_user_id
  for update of c;

  if not found then
    raise exception 'Child not found or access denied' using errcode = '42501';
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

create or replace function public.reveal_collectible(target_child_collectible_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_auth_user_id uuid := (select auth.uid());
  owned_child_id uuid;
  pending_points numeric(10, 6);
  target_status text;
  target_revealed_at timestamptz;
  target_theme_code text;
  has_other_unrevealed boolean;
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
  if target_child_collectible_id is null then
    raise exception 'Collectible is required' using errcode = '22023';
  end if;

  select cc.child_id
  into owned_child_id
  from public.child_collectibles as cc
  join public.children as c on c.id operator(pg_catalog.=) cc.child_id
  join public.profiles as p on p.id operator(pg_catalog.=) c.parent_id
  where cc.id operator(pg_catalog.=) target_child_collectible_id
    and p.auth_user_id operator(pg_catalog.=) current_auth_user_id;

  if not found then
    raise exception 'Collectible not found or access denied' using errcode = '42501';
  end if;

  select c.pending_growth_points
  into pending_points
  from public.children as c
  where c.id operator(pg_catalog.=) owned_child_id
  for update;

  select cc.status, cc.revealed_at, cc.theme_code
  into target_status, target_revealed_at, target_theme_code
  from public.child_collectibles as cc
  where cc.id operator(pg_catalog.=) target_child_collectible_id
    and cc.child_id operator(pg_catalog.=) owned_child_id
  for update;

  if not found then
    raise exception 'Collectible not found or access denied' using errcode = '42501';
  end if;

  if target_status is distinct from 'COMPLETED' then
    raise exception 'Only completed collectibles can be revealed' using errcode = '22023';
  end if;
  if target_revealed_at is not null then
    return;
  end if;

  update public.child_collectibles as cc
  set revealed_at = pg_catalog.now(), updated_at = pg_catalog.now()
  where cc.id operator(pg_catalog.=) target_child_collectible_id;

  select exists (
    select 1
    from public.child_collectibles as waiting
    where waiting.child_id operator(pg_catalog.=) owned_child_id
      and waiting.theme_code operator(pg_catalog.=) target_theme_code
      and waiting.status operator(pg_catalog.=) 'COMPLETED'
      and waiting.revealed_at is null
  )
  into has_other_unrevealed;

  if has_other_unrevealed then
    return;
  end if;

  select growing.id, growing.progress_points, growing.growth_goal_snapshot
  into growing_collectible_id, growing_progress, growing_goal
  from public.child_collectibles as growing
  where growing.child_id operator(pg_catalog.=) owned_child_id
    and growing.theme_code operator(pg_catalog.=) target_theme_code
    and growing.status operator(pg_catalog.=) 'GROWING'
  for update;

  if growing_collectible_id is null then
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
      return;
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

  if pending_points operator(pg_catalog.>) 0 then
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

-- Keep Step 1 onboarding compatible with the tightened target-minute constraint.
create or replace function public.complete_parent_onboarding(
  child_name text,
  target_minutes integer,
  parent_pin text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_auth_user_id uuid := (select auth.uid());
  current_profile_id uuid;
begin
  if current_auth_user_id is null then
    raise exception 'Authentication required';
  end if;
  if pg_catalog.char_length(pg_catalog.btrim(child_name)) not between 1 and 20 then
    raise exception 'Child name must contain between 1 and 20 characters';
  end if;
  if target_minutes not between 10 and 240 then
    raise exception 'Target minutes must be between 10 and 240';
  end if;
  if parent_pin operator(pg_catalog.!~) '^[0-9]{4}$' then
    raise exception 'Parent PIN must contain exactly four digits';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(current_auth_user_id::text, 0)
  );

  insert into public.profiles (auth_user_id)
  values (current_auth_user_id)
  on conflict (auth_user_id) do update set updated_at = pg_catalog.now()
  returning id into current_profile_id;

  insert into public.children (parent_id, name, daily_target_minutes)
  values (current_profile_id, pg_catalog.btrim(child_name), target_minutes)
  on conflict (parent_id) do update
  set
    name = excluded.name,
    daily_target_minutes = excluded.daily_target_minutes,
    updated_at = pg_catalog.now();

  insert into public.parent_pin_credentials (parent_id, pin_hash)
  values (
    current_profile_id,
    extensions.crypt(parent_pin, extensions.gen_salt('bf', 12))
  )
  on conflict (parent_id) do update
  set pin_hash = excluded.pin_hash, updated_at = pg_catalog.now();

  update public.profiles
  set onboarding_completed = true, updated_at = pg_catalog.now()
  where id = current_profile_id;
end;
$$;

revoke all on function public.ensure_daily_plan(uuid, date)
from public, anon, authenticated;
revoke all on function public.start_daily_task(uuid)
from public, anon, authenticated;
revoke all on function public.complete_daily_task(uuid)
from public, anon, authenticated;
revoke all on function public.undo_daily_task_completion(uuid)
from public, anon, authenticated;
revoke all on function public.add_manual_daily_task(uuid, date, text, text, text, integer, integer, smallint)
from public, anon, authenticated;
revoke all on function public.reschedule_manual_task(uuid, date)
from public, anon, authenticated;
revoke all on function public.skip_manual_task(uuid)
from public, anon, authenticated;
revoke all on function public.confirm_daily_tasks(jsonb)
from public, anon, authenticated;
revoke all on function public.select_collection_theme(text)
from public, anon, authenticated;
revoke all on function public.reveal_collectible(uuid)
from public, anon, authenticated;
revoke all on function public.complete_parent_onboarding(text, integer, text)
from public, anon, authenticated;

grant execute on function public.ensure_daily_plan(uuid, date) to authenticated;
grant execute on function public.start_daily_task(uuid) to authenticated;
grant execute on function public.complete_daily_task(uuid) to authenticated;
grant execute on function public.undo_daily_task_completion(uuid) to authenticated;
grant execute on function public.add_manual_daily_task(uuid, date, text, text, text, integer, integer, smallint) to authenticated;
grant execute on function public.reschedule_manual_task(uuid, date) to authenticated;
grant execute on function public.skip_manual_task(uuid) to authenticated;
grant execute on function public.confirm_daily_tasks(jsonb) to authenticated;
grant execute on function public.select_collection_theme(text) to authenticated;
grant execute on function public.reveal_collectible(uuid) to authenticated;
grant execute on function public.complete_parent_onboarding(text, integer, text) to authenticated;

commit;
