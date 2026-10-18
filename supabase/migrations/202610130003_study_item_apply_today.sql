begin;

-- Register the item and optionally append today's AUTO task in one transaction.
-- The existing planner intentionally freezes membership once a plan exists.
create function public.create_study_item(
  target_child_id uuid,
  item_values jsonb,
  apply_from_today boolean default false
)
returns setof public.study_items
language plpgsql
security definer
set search_path = ''
as $$
declare
  today date := (pg_catalog.statement_timestamp() at time zone 'Asia/Seoul')::date;
  weekday smallint := pg_catalog.date_part('isodow', today)::smallint;
  plan_id uuid;
  next_page integer;
  new_item public.study_items;
begin
  if item_values is null or pg_catalog.jsonb_typeof(item_values) <> 'object'
     or apply_from_today is null then
    raise exception 'Item values and apply-from-today flag are required' using errcode = '22023';
  end if;

  -- Validates ownership and locks the child, serializing with planning, ordering,
  -- progress confirmation and other registrations. Freeze today's membership
  -- BEFORE insertion so an unchecked item cannot appear on a later ensure call.
  plan_id := public.ensure_daily_plan(target_child_id, today);

  if item_values->>'item_type' = 'WORKBOOK' then
    next_page := coalesce((item_values->>'workbook_next_start_page')::integer, 1);
    if next_page < 1 or next_page > (item_values->>'workbook_last_page')::integer then
      raise exception 'Invalid workbook start page' using errcode = '22023';
    end if;
  end if;

  insert into public.study_items (
    child_id, item_type, name, subject, estimated_minutes, study_weekdays,
    workbook_pages_per_session, workbook_last_page, workbook_last_completed_page
  ) values (
    target_child_id, item_values->>'item_type', pg_catalog.btrim(item_values->>'name'),
    item_values->>'subject', (item_values->>'estimated_minutes')::smallint,
    array(select value::smallint from pg_catalog.jsonb_array_elements_text(item_values->'study_weekdays')),
    case when item_values->>'item_type' = 'WORKBOOK' then (item_values->>'workbook_pages_per_session')::smallint end,
    case when item_values->>'item_type' = 'WORKBOOK' then (item_values->>'workbook_last_page')::integer end,
    case when item_values->>'item_type' = 'WORKBOOK' then next_page - 1 end
  ) returning * into new_item;

  if apply_from_today and weekday = any(new_item.study_weekdays)
     and exists(select 1 from public.daily_plans where id = plan_id and day_type = 'STUDY')
     and not exists(select 1 from public.children where id = target_child_id and weekday = any(rest_weekdays)) then
    insert into public.daily_tasks (
      daily_plan_id, study_item_id, source_type, item_type, name_snapshot,
      subject_snapshot, planned_start_page, planned_end_page, planned_minutes,
      growth_weight, planning_revision, sort_order
    ) values (
      plan_id, new_item.id, 'AUTO', new_item.item_type, new_item.name, new_item.subject,
      case when new_item.item_type = 'WORKBOOK' then next_page end,
      case when new_item.item_type = 'WORKBOOK'
        then least(next_page::bigint + new_item.workbook_pages_per_session - 1, new_item.workbook_last_page)::integer end,
      new_item.estimated_minutes, 1, new_item.planning_revision,
      (select coalesce(max(sort_order)::integer + 1, 0)::smallint from public.daily_tasks where daily_plan_id = plan_id)
    );
  end if;

  return next new_item;
end;
$$;

revoke all on function public.create_study_item(uuid,jsonb,boolean) from public, anon, authenticated;
grant execute on function public.create_study_item(uuid,jsonb,boolean) to authenticated;

commit;
