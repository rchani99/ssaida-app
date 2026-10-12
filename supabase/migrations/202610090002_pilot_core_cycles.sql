begin;

-- Server-only operational measurement. Never store names, answers, or photos here.
create table public.pilot_core_cycles (
  daily_task_id uuid primary key,
  parent_id uuid not null references public.profiles(id) on delete cascade,
  child_completed_at timestamptz not null,
  parent_verified_at timestamptz not null,
  verification_status text not null check (verification_status in ('PARENT_CONFIRMED', 'PARTIAL', 'RETRY')),
  captured_at timestamptz not null default pg_catalog.now(),
  check (parent_verified_at >= child_completed_at)
);
create index pilot_core_cycles_parent_time_idx on public.pilot_core_cycles(parent_id, parent_verified_at);
alter table public.pilot_core_cycles enable row level security;
revoke all on public.pilot_core_cycles from public, anon, authenticated;
grant select, delete on public.pilot_core_cycles to service_role;

create function public.capture_pilot_core_cycle()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status in ('PARENT_CONFIRMED', 'PARTIAL', 'RETRY')
     and new.child_completed_at is not null and new.parent_verified_at is not null
     and new.parent_verified_at >= new.child_completed_at then
    insert into public.pilot_core_cycles(daily_task_id, parent_id, child_completed_at, parent_verified_at, verification_status)
    select new.id, c.parent_id, new.child_completed_at, new.parent_verified_at, new.status
    from public.daily_plans dp join public.children c on c.id = dp.child_id
    where dp.id = new.daily_plan_id
    on conflict (daily_task_id) do nothing;
  end if;
  return new;
end;
$$;
revoke all on function public.capture_pilot_core_cycle() from public, anon, authenticated;
create trigger capture_pilot_core_cycle
after insert or update of status, child_completed_at, parent_verified_at on public.daily_tasks
for each row execute function public.capture_pilot_core_cycle();

-- Prospective only: do not infer missing history or silently turn old test data into pilot use.
commit;
