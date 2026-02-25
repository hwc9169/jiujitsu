-- 기본 프로그램 3종 백필
-- 대상: 기존 gyms (이미 운영 중인 계정)
-- 규칙: gym별로 없는 프로그램만 추가

with default_programs(name, color) as (
  values
    ('기 수업', '#0e3b2e'),
    ('노기 수업', '#1f4d3d'),
    ('오픈매트', '#7a8b83')
)
insert into public.programs (gym_id, name, color, is_active)
select
  g.id as gym_id,
  dp.name,
  dp.color,
  true as is_active
from public.gyms g
cross join default_programs dp
where not exists (
  select 1
  from public.programs p
  where p.gym_id = g.id
    and p.name = dp.name
);

