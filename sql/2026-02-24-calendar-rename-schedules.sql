-- rename legacy routine_override objects to schedule

do $$
begin
  if exists (
    select 1
    from pg_type
    where typnamespace = 'public'::regnamespace
      and typname = 'routine_override_action'
  )
  and not exists (
    select 1
    from pg_type
    where typnamespace = 'public'::regnamespace
      and typname = 'schedule_action'
  ) then
    alter type public.routine_override_action rename to schedule_action;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typnamespace = 'public'::regnamespace
      and typname = 'schedule_action'
  ) then
    create type public.schedule_action as enum ('CANCEL', 'MODIFY', 'ADD');
  end if;
end $$;

create table if not exists public.schedules (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms(id) on delete cascade,
  date date not null,
  routine_id uuid null references public.routines(id) on delete set null,
  action public.schedule_action not null,
  program_id uuid null references public.programs(id),
  start_time time null,
  end_time time null,
  capacity integer null,
  coach_name text null,
  title text null,
  location text null,
  note text null,
  created_at timestamptz not null default now()
);

do $$
begin
  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'routine_overrides'
      and c.relkind = 'r'
  )
  and not exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'schedules'
      and c.relkind = 'r'
  ) then
    alter table public.routine_overrides rename to schedules;
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'routine_overrides'
      and c.relkind = 'r'
  )
  and exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'schedules'
      and c.relkind = 'r'
  ) then
    insert into public.schedules (
      id,
      gym_id,
      date,
      routine_id,
      action,
      program_id,
      start_time,
      end_time,
      capacity,
      coach_name,
      title,
      location,
      note,
      created_at
    )
    select
      ro.id,
      ro.gym_id,
      ro.date,
      ro.routine_id,
      ro.action::text::public.schedule_action,
      ro.program_id,
      ro.start_time,
      ro.end_time,
      ro.capacity,
      ro.coach_name,
      ro.title,
      ro.location,
      ro.note,
      ro.created_at
    from public.routine_overrides ro
    on conflict (id) do nothing;

    drop table public.routine_overrides;
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'schedules'
      and column_name = 'action'
  ) then
    alter table public.schedules
      alter column action type public.schedule_action
      using action::text::public.schedule_action;
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'routine_overrides_capacity_check'
      and conrelid = 'public.schedules'::regclass
  )
  and not exists (
    select 1
    from pg_constraint
    where conname = 'schedules_capacity_check'
      and conrelid = 'public.schedules'::regclass
  ) then
    alter table public.schedules
      rename constraint routine_overrides_capacity_check to schedules_capacity_check;
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'routine_overrides_time_range_check'
      and conrelid = 'public.schedules'::regclass
  )
  and not exists (
    select 1
    from pg_constraint
    where conname = 'schedules_time_range_check'
      and conrelid = 'public.schedules'::regclass
  ) then
    alter table public.schedules
      rename constraint routine_overrides_time_range_check to schedules_time_range_check;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'schedules_capacity_check'
      and conrelid = 'public.schedules'::regclass
  ) then
    alter table public.schedules
      add constraint schedules_capacity_check
      check (capacity is null or capacity >= 0);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'schedules_time_range_check'
      and conrelid = 'public.schedules'::regclass
  ) then
    alter table public.schedules
      add constraint schedules_time_range_check
      check (start_time is null or end_time is null or start_time < end_time);
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from pg_class where relname = 'idx_routine_overrides_gym_date' and relkind = 'i'
  )
  and not exists (
    select 1 from pg_class where relname = 'idx_schedules_gym_date' and relkind = 'i'
  ) then
    alter index public.idx_routine_overrides_gym_date rename to idx_schedules_gym_date;
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from pg_class where relname = 'idx_routine_overrides_routine_date' and relkind = 'i'
  )
  and not exists (
    select 1 from pg_class where relname = 'idx_schedules_routine_date' and relkind = 'i'
  ) then
    alter index public.idx_routine_overrides_routine_date rename to idx_schedules_routine_date;
  end if;
end $$;

create index if not exists idx_schedules_gym_date on public.schedules(gym_id, date);
create index if not exists idx_schedules_routine_date on public.schedules(gym_id, routine_id, date);

grant select, insert, update, delete on table public.schedules to service_role;
alter table public.schedules enable row level security;

do $$
begin
  if exists (
    select 1
    from pg_type
    where typnamespace = 'public'::regnamespace
      and typname = 'routine_override_action'
  ) then
    begin
      drop type public.routine_override_action;
    exception
      when dependent_objects_still_exist then
        null;
    end;
  end if;
end $$;

