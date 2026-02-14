-- members 확장: 띠/생년월일/등록정지-재개

alter table public.members
  add column if not exists belt text,
  add column if not exists belt_gral integer default 0,
  add column if not exists birth_date date,
  add column if not exists membership_state text default 'ACTIVE',
  add column if not exists paused_at timestamptz,
  add column if not exists paused_days_total integer default 0;

update public.members
set membership_state = 'ACTIVE'
where membership_state is null;

update public.members
set paused_days_total = 0
where paused_days_total is null;

update public.members
set belt_gral = 0
where belt_gral is null;

alter table public.members
  alter column membership_state set not null,
  alter column belt_gral set not null,
  alter column paused_days_total set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'members_membership_state_check'
      and conrelid = 'public.members'::regclass
  ) then
    alter table public.members
      add constraint members_membership_state_check
      check (membership_state in ('ACTIVE', 'PAUSED'));
  end if;
end$$;

alter table public.members
  drop constraint if exists members_belt_check;

alter table public.members
  add constraint members_belt_check
  check (
    belt is null
    or belt in ('흰띠', '그레이띠', '오렌지띠', '초록띠', '파란띠', '보라띠', '갈색띠', '검은띠')
  );

alter table public.members
  drop constraint if exists members_belt_gral_check;

alter table public.members
  add constraint members_belt_gral_check
  check (belt_gral between 0 and 4);

create or replace view public.v_members_with_status as
select
  m.id,
  m.gym_id,
  m.name,
  m.phone,
  m.gender,
  m.belt,
  m.belt_gral,
  m.birth_date,
  m.start_date,
  m.expire_date,
  m.membership_state,
  m.paused_at,
  m.paused_days_total,
  m.memo,
  m.created_at,
  m.updated_at,
  m.deleted_at,
  case
    when m.expire_date < current_date then 'OVERDUE'
    when m.expire_date between current_date and (current_date + 7) then 'EXPIRING'
    else 'NORMAL'
  end as status
from public.members m;
