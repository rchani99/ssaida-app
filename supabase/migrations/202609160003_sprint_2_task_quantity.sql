begin;

-- Independent of StudyItem planning generations. Only the quantity RPC sets this.
alter table public.daily_tasks
  add column quantity_manually_adjusted boolean not null default false;

create function public.update_daily_task_quantity(
  target_daily_task_id uuid,
  expected_updated_at timestamptz,
  new_value numeric
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  owned_child_id uuid;
  plan_id uuid;
  task public.daily_tasks%rowtype;
  plan_date date;
  last_page integer;
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
  if not found then
    raise exception 'Task changed' using errcode = 'PT409';
  end if;
  if plan_date is distinct from pg_catalog.timezone('Asia/Seoul', pg_catalog.clock_timestamp())::date then
    raise exception 'Only today can be edited' using errcode = 'PT409';
  end if;
  if task.status <> 'PLANNED' or task.started_at is not null
    or task.updated_at is distinct from expected_updated_at
    or exists(select 1 from public.daily_tasks t where t.source_daily_task_id = task.id) then
    raise exception 'Task changed; reload' using errcode = 'PT409';
  end if;
  -- numeric avoids silently rounding decimal JSON input at the RPC boundary.
  if new_value is null or new_value < 1 or new_value > 2147483647
    or new_value <> pg_catalog.trunc(new_value) or new_value = 'NaN'::numeric then
    raise exception 'Positive integer required' using errcode = '22023';
  end if;

  if task.item_type = 'WORKBOOK' then
    if new_value < task.planned_start_page then
      raise exception 'End must reach the fixed start page' using errcode = '22023';
    end if;
    if task.study_item_id is not null then
      select si.workbook_last_page into last_page from public.study_items si
      where si.id = task.study_item_id and si.child_id = owned_child_id and si.item_type = 'WORKBOOK'
      for update;
      if not found or new_value > last_page then
        raise exception 'Workbook bound exceeded' using errcode = '22023';
      end if;
    end if;
    update public.daily_tasks set planned_end_page = new_value::integer,
      quantity_manually_adjusted = true where id = task.id;
  else
    if new_value > 32767 then
      raise exception 'Minutes exceed smallint range' using errcode = '22023';
    end if;
    update public.daily_tasks set planned_minutes = new_value::smallint,
      quantity_manually_adjusted = true where id = task.id;
  end if;
end;
$$;

-- Preserve manually adjusted snapshots, including when a late confirmation
-- finishes the workbook. They advance the cursor like other protected snapshots;
-- untouched later AUTO rows still follow the existing recalculation/delete rule.
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

      -- Only a successful confirmation of this planning generation consumes the
      -- override. Misses/RETRY and confirmations from an older generation do not.
      update public.study_items as si
      set workbook_next_start_page_override = null
      where si.id operator(pg_catalog.=) task_record.study_item_id
        and (si.planning_revision is not distinct from task_record.planning_revision
          or si.status operator(pg_catalog.=) 'COMPLETED')
        and si.workbook_next_start_page_override is not null;

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
          future.started_at,
          future.quantity_manually_adjusted,
          future.planned_start_page,
          future.planned_end_page
        from public.daily_tasks as future
        join public.daily_plans as future_plan
          on future_plan.id operator(pg_catalog.=) future.daily_plan_id
        where future.study_item_id operator(pg_catalog.=) task_record.study_item_id
          and future.source_type operator(pg_catalog.=) 'AUTO'
          and (future.planning_revision is not distinct from task_record.planning_revision
            or confirmed_progress_after operator(pg_catalog.>=) locked_workbook_last_page)
          and future.item_type operator(pg_catalog.=) 'WORKBOOK'
          and future_plan.plan_date operator(pg_catalog.>) task_record.plan_date
        order by future_plan.plan_date, future.created_at, future.id
        for update of future
      loop
        if future_task.status operator(pg_catalog.=) 'PLANNED'
          and future_task.started_at is null
          and not future_task.quantity_manually_adjusted then
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

revoke all on function public.update_daily_task_quantity(uuid, timestamptz, numeric) from public, anon, authenticated;
grant execute on function public.update_daily_task_quantity(uuid, timestamptz, numeric) to authenticated;
revoke all on function public.confirm_daily_tasks(jsonb) from public, anon, authenticated;
grant execute on function public.confirm_daily_tasks(jsonb) to authenticated;
commit;
