-- members 확장: 입관 날짜(join_date)

alter table public.members
  add column if not exists join_date date;

update public.members
set join_date = coalesce(start_date, created_at::date, current_date)
where join_date is null;

alter table public.members
  alter column join_date set default current_date,
  alter column join_date set not null;

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
  m.join_date,
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

