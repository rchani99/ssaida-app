begin;

create function public.reorder_daily_tasks(target_daily_plan_id uuid, ordered_tasks jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid;
  plan_date date;
  task_ids uuid[];
  slots smallint[];
  requested_ids uuid[];
  entry record;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  select c.id into owner_id
  from public.daily_plans dp
  join public.children c on c.id = dp.child_id
  join public.profiles p on p.id = c.parent_id
  where dp.id = target_daily_plan_id and p.auth_user_id = auth.uid();
  if not found then
    raise exception 'Plan not found or access denied' using errcode = '42501';
  end if;

  -- Same child-first serialization as start/confirm/add/reschedule/ensure.
  perform 1 from public.children c where c.id = owner_id for update;
  select dp.plan_date into plan_date from public.daily_plans dp
  where dp.id = target_daily_plan_id and dp.child_id = owner_id for update;
  -- Check after waiting for locks: an editor opened before Seoul midnight expires.
  if plan_date is distinct from pg_catalog.timezone('Asia/Seoul', pg_catalog.clock_timestamp())::date then
    raise exception 'Only the current Seoul date is editable' using errcode = '22023';
  end if;
  if ordered_tasks is null or pg_catalog.jsonb_typeof(ordered_tasks) <> 'array' then
    raise exception 'An ordered task array is required' using errcode = '22023';
  end if;
  if pg_catalog.jsonb_array_length(ordered_tasks) < 2 then
    raise exception 'At least two tasks are required' using errcode = '22023';
  end if;
  select pg_catalog.array_agg(x.id) into requested_ids
  from pg_catalog.jsonb_to_recordset(ordered_tasks) as x(id uuid, expected_updated_at timestamptz, expected_sort_order smallint);
  if pg_catalog.array_position(requested_ids, null) is not null
    or (select pg_catalog.count(distinct id) from pg_catalog.unnest(requested_ids) as r(id)) <> pg_catalog.cardinality(requested_ids) then
    raise exception 'Missing or duplicate task IDs' using errcode = '22023';
  end if;

  perform 1 from public.daily_tasks dt where dt.daily_plan_id = target_daily_plan_id
  order by dt.id for update;
  select pg_catalog.array_agg(dt.id order by dt.sort_order, dt.id),
         pg_catalog.array_agg(dt.sort_order order by dt.sort_order, dt.id)
  into task_ids, slots
  from public.daily_tasks dt
  where dt.daily_plan_id = target_daily_plan_id
    and dt.status = 'PLANNED' and dt.started_at is null
    and not exists(select 1 from public.daily_tasks successor where successor.source_daily_task_id = dt.id);
  if pg_catalog.cardinality(task_ids) is distinct from pg_catalog.cardinality(requested_ids)
    or not (requested_ids @> task_ids and task_ids @> requested_ids) then
    raise exception 'Editable task list changed' using errcode = '40001';
  end if;
  if exists (
    select 1 from pg_catalog.jsonb_to_recordset(ordered_tasks)
      as x(id uuid, expected_updated_at timestamptz, expected_sort_order smallint)
    join public.daily_tasks dt on dt.id = x.id
    where dt.updated_at is distinct from x.expected_updated_at
      or dt.sort_order is distinct from x.expected_sort_order
  ) then
    raise exception 'Task changed; reload before saving' using errcode = '40001';
  end if;
  -- Preserve all non-editable rows and their slots. Never normalize the whole plan.
  if (select pg_catalog.count(distinct n) from pg_catalog.unnest(slots) as s(n)) <> pg_catalog.cardinality(slots) then
    raise exception 'Ambiguous task order' using errcode = '40001';
  end if;
  for entry in
    select x.value, x.ordinality from pg_catalog.jsonb_array_elements(ordered_tasks) with ordinality as x(value, ordinality)
  loop
    update public.daily_tasks dt set sort_order = slots[entry.ordinality::integer]
    where dt.id = (entry.value ->> 'id')::uuid
      and dt.sort_order is distinct from slots[entry.ordinality::integer];
  end loop;
end;
$$;

revoke all on function public.reorder_daily_tasks(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.reorder_daily_tasks(uuid, jsonb) to authenticated;
commit;
