-- member payments ledger

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  payment_date date not null,
  start_date date not null,
  expire_date date not null,
  months integer not null,
  amount integer not null,
  memo text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'payments_months_check'
      and conrelid = 'public.payments'::regclass
  ) then
    alter table public.payments
      add constraint payments_months_check
      check (months > 0);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'payments_amount_check'
      and conrelid = 'public.payments'::regclass
  ) then
    alter table public.payments
      add constraint payments_amount_check
      check (amount >= 0);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'payments_date_range_check'
      and conrelid = 'public.payments'::regclass
  ) then
    alter table public.payments
      add constraint payments_date_range_check
      check (start_date <= expire_date);
  end if;
end $$;

create index if not exists idx_payments_gym_date on public.payments(gym_id, payment_date);
create index if not exists idx_payments_member_date on public.payments(gym_id, member_id, payment_date desc);

create or replace function public.set_payments_updated_at()
returns trigger
language plpgsql
SET search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_payments_updated_at on public.payments;
create trigger trg_payments_updated_at
before update on public.payments
for each row
execute function public.set_payments_updated_at();

grant select, insert, update, delete on table public.payments to service_role;
alter table public.payments enable row level security;
