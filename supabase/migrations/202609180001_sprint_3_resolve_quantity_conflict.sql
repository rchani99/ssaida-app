begin;

-- NULL retains the existing user-selected today exclusion semantics. The new
-- reason distinguishes a parent-approved resolution of fully confirmed pages.
alter table public.daily_tasks
  add column exclusion_reason text,
  add constraint daily_tasks_exclusion_reason_check check (
    exclusion_reason is null or (
      exclusion_reason = 'CONFIRMED_PROGRESS'
      and excluded_for_today and item_type = 'WORKBOOK'
      and quantity_manually_adjusted
    )
  );

-- Preview is read-only (apart from transaction-scoped row locks). Save calls
-- the same calculator under the same child lock, so client-supplied page ranges
-- can never clear a conflict. No StudyItem/override/revision/growth writes.
create function public.preview_quantity_conflict_resolution(target_daily_task_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  owned_child_id uuid;
  plan_id uuid;
  plan_date date;
  task public.daily_tasks%rowtype;
  item public.study_items%rowtype;
  today date;
  progress integer;
  new_start integer;
  new_end integer;
  action text;
  kind text;
  related jsonb;
  context_token text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  select c.id, dp.id into owned_child_id, plan_id
  from public.daily_tasks dt
  join public.daily_plans dp on dp.id = dt.daily_plan_id
  join public.children c on c.id = dp.child_id
  join public.profiles p on p.id = c.parent_id
  where dt.id = target_daily_task_id and p.auth_user_id = auth.uid();
  if not found then
    raise exception 'Task not found or access denied' using errcode = '42501';
  end if;

  perform 1 from public.children c where c.id = owned_child_id for update;
  select dp.plan_date into plan_date from public.daily_plans dp where dp.id = plan_id for update;
  select dt.* into task from public.daily_tasks dt where dt.id = target_daily_task_id for update;
  today := pg_catalog.timezone('Asia/Seoul', pg_catalog.clock_timestamp())::date;
  if not found or plan_date is distinct from today
    or task.source_type <> 'AUTO' or task.item_type <> 'WORKBOOK'
    or task.status <> 'PLANNED' or task.started_at is not null
    or not task.quantity_manually_adjusted or task.quantity_conflict is null
    or task.excluded_for_today then
    raise exception 'Task changed; reload' using errcode = 'PT409';
  end if;

  select si.* into item from public.study_items si
  where si.id = task.study_item_id and si.child_id = owned_child_id and si.item_type = 'WORKBOOK'
  for update;
  if not found then
    raise exception 'Study item changed; reload' using errcode = 'PT409';
  end if;

  -- The UI entry gate is not a security boundary. Do not discard ranges based
  -- only on an unverified provisional completion (which could later be PARTIAL).
  if exists (
    select 1 from public.daily_tasks dt
    join public.daily_plans dp on dp.id = dt.daily_plan_id
    where dp.child_id = owned_child_id and dp.plan_date < today
      and dt.status = 'CHILD_COMPLETED' and dt.parent_verified_at is null
  ) then
    raise exception 'Confirm past tasks first' using errcode = 'PT412';
  end if;
  progress := item.workbook_last_completed_page;
  action := 'ADJUST';
  if progress >= task.planned_end_page then
    kind := 'FULL_OVERLAP';
    action := 'EXCLUDE';
    new_start := task.planned_start_page;
    new_end := task.planned_end_page;
  else
    -- An old generation must not silently consume/replace a newer override.
    if task.planning_revision is distinct from item.planning_revision then
      raise exception 'Planning generation changed' using errcode = 'PT422';
    end if;
    new_start := progress + 1;
    if progress < task.planned_start_page - 1 then
      kind := 'GAP';
      new_end := least(
        item.workbook_last_page::bigint,
        progress::bigint + task.planned_end_page::bigint - task.planned_start_page::bigint + 1
      )::integer;
    elsif progress < task.planned_start_page then
      kind := 'ALIGNED';
      new_end := task.planned_end_page;
    else
      kind := 'PARTIAL_OVERLAP';
      new_end := task.planned_end_page;
    end if;
    if new_start > new_end or new_end > item.workbook_last_page then
      raise exception 'Workbook bounds changed' using errcode = 'PT409';
    end if;

    -- A late confirmation may already have recalculated another future plan
    -- around this blocked task. Never silently rewrite that plan to make room.
    -- Past PLANNED misses remain history; unresolved started work is protected.
    if exists (
      select 1 from public.daily_tasks dt
      join public.daily_plans dp on dp.id = dt.daily_plan_id
      where dt.study_item_id = item.id and dt.id <> task.id
        and not dt.excluded_for_today and dt.quantity_conflict is null
        and (
          dt.status in ('IN_PROGRESS', 'CHILD_COMPLETED', 'RETRY')
          or (dp.plan_date >= today and dt.status = 'PLANNED'
            and dt.planned_start_page <= new_end and dt.planned_end_page >= new_start)
        )
    ) then
      raise exception 'Another plan needs review' using errcode = 'PT423';
    end if;
  end if;

  -- Covers dependencies that can change without updating the target itself:
  -- confirmation/provisional progress, other plans, override, revision, bounds.
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(dt) order by dt.id), '[]'::jsonb)
  into related from public.daily_tasks dt where dt.study_item_id = item.id and dt.id <> task.id;
  context_token := pg_catalog.md5(pg_catalog.jsonb_build_object(
    'task', pg_catalog.to_jsonb(task), 'item', pg_catalog.to_jsonb(item),
    'related', related, 'date', today
  )::text);
  return pg_catalog.jsonb_build_object(
    'task_id', task.id, 'context_token', context_token, 'kind', kind, 'action', action,
    'confirmed_progress', progress, 'old_start', task.planned_start_page,
    'old_end', task.planned_end_page, 'new_start', new_start, 'new_end', new_end
  );
end;
$$;

create function public.resolve_quantity_conflict(
  target_daily_task_id uuid,
  expected_context_token text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare proposal jsonb;
begin
  -- Includes ownership validation and retains its child/plan/task/item locks
  -- until this transaction commits. Any failure rolls back the complete save.
  proposal := public.preview_quantity_conflict_resolution(target_daily_task_id);
  if expected_context_token is null
    or expected_context_token is distinct from proposal ->> 'context_token' then
    raise exception 'Resolution changed; reload' using errcode = 'PT409';
  end if;
  if proposal ->> 'action' = 'EXCLUDE' then
    update public.daily_tasks set quantity_conflict = null, excluded_for_today = true,
      exclusion_reason = 'CONFIRMED_PROGRESS', updated_at = pg_catalog.clock_timestamp()
    where id = target_daily_task_id;
  else
    update public.daily_tasks set quantity_conflict = null,
      planned_start_page = (proposal ->> 'new_start')::integer,
      planned_end_page = (proposal ->> 'new_end')::integer,
      updated_at = pg_catalog.clock_timestamp()
    where id = target_daily_task_id;
  end if;
  return proposal;
end;
$$;

revoke all on function public.preview_quantity_conflict_resolution(uuid) from public, anon, authenticated;
revoke all on function public.resolve_quantity_conflict(uuid, text) from public, anon, authenticated;
grant execute on function public.preview_quantity_conflict_resolution(uuid) to authenticated;
grant execute on function public.resolve_quantity_conflict(uuid, text) to authenticated;

-- Existing owner SELECT RLS and lack of client writes cover the new metadata.
notify pgrst, 'reload schema';
commit;
