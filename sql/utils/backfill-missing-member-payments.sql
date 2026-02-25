-- backfill: create one payment row per existing member (only members without any payment rows)
-- default unit_price is 150000. change this value before running if needed.

with params as (
  select 150000::integer as unit_price
),
source_members as (
  select
    m.id as member_id,
    m.gym_id,
    least(
      coalesce(m.start_date, m.join_date, m.created_at::date, m.expire_date),
      m.expire_date
    ) as start_date,
    m.expire_date
  from public.members m
  where m.expire_date is not null
    and not exists (
      select 1
      from public.payments p
      where p.gym_id = m.gym_id
        and p.member_id = m.id
    )
),
normalized as (
  select
    s.member_id,
    s.gym_id,
    s.start_date,
    s.expire_date,
    greatest(
      1,
      (
        (extract(year from s.expire_date)::int - extract(year from s.start_date)::int) * 12
        + (extract(month from s.expire_date)::int - extract(month from s.start_date)::int)
      )
    ) as months
  from source_members s
)
insert into public.payments (
  gym_id,
  member_id,
  payment_date,
  start_date,
  expire_date,
  months,
  amount,
  memo
)
select
  n.gym_id,
  n.member_id,
  n.start_date as payment_date,
  n.start_date,
  n.expire_date,
  n.months,
  n.months * params.unit_price as amount,
  '[BACKFILL] members->payments'::text as memo
from normalized n
cross join params;

-- verification query
-- select gym_id, count(*) as inserted_count
-- from public.payments
-- where memo = '[BACKFILL] members->payments'
-- group by gym_id
-- order by gym_id;
