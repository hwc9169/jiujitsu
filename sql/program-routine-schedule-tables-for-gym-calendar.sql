-- calendar MVP: program / routine / schedule

create table if not exists public.programs (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms(id) on delete cascade,
  name text not null,
  color text not null default '#0e3b2e',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_programs_gym_id on public.programs(gym_id);
create index if not exists idx_programs_active on public.programs(gym_id, is_active);

create table if not exists public.routines (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms(id) on delete cascade,
  program_id uuid not null references public.programs(id),
  day_of_week integer not null,
  start_time time not null,
  end_time time not null,
  capacity integer null,
  coach_name text null,
  effective_from date not null default current_date,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'routines_day_of_week_check'
      and conrelid = 'public.routines'::regclass
  ) then
    alter table public.routines
      add constraint routines_day_of_week_check
      check (day_of_week between 0 and 6);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'routines_capacity_check'
      and conrelid = 'public.routines'::regclass
  ) then
    alter table public.routines
      add constraint routines_capacity_check
      check (capacity is null or capacity >= 0);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'routines_time_range_check'
      and conrelid = 'public.routines'::regclass
  ) then
    alter table public.routines
      add constraint routines_time_range_check
      check (start_time < end_time);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'routines_effective_range_check'
      and conrelid = 'public.routines'::regclass
  ) then
    alter table public.routines
      add constraint routines_effective_range_check
      check (effective_to is null or effective_from <= effective_to);
  end if;
end $$;

create index if not exists idx_routines_gym_day on public.routines(gym_id, day_of_week);
create index if not exists idx_routines_effective on public.routines(gym_id, effective_from, effective_to);
create index if not exists idx_routines_program_id on public.routines(program_id);

do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'schedule_action'
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
  if not exists (
    select 1 from pg_constraint
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
    select 1 from pg_constraint
    where conname = 'schedules_time_range_check'
      and conrelid = 'public.schedules'::regclass
  ) then
    alter table public.schedules
      add constraint schedules_time_range_check
      check (start_time is null or end_time is null or start_time < end_time);
  end if;
end $$;

create index if not exists idx_schedules_gym_date on public.schedules(gym_id, date);
create index if not exists idx_schedules_routine_date on public.schedules(gym_id, routine_id, date);

grant select, insert, update, delete on table public.programs to service_role;
grant select, insert, update, delete on table public.routines to service_role;
grant select, insert, update, delete on table public.schedules to service_role;

alter table public.programs enable row level security;
alter table public.routines enable row level security;
alter table public.schedules enable row level security;
