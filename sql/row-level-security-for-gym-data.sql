-- RLS 활성화
alter table public.gyms enable row level security;
alter table public.gym_users enable row level security;
alter table public.members enable row level security;
alter table public.message_templates enable row level security;
alter table public.message_logs enable row level security;

-- helper: 현재 유저가 gym의 구성원인지 확인
create or replace function public.is_gym_user(p_gym_id uuid)
returns boolean language sql stable
SET search_path = public
AS $$
  select exists (
    select 1
    from public.gym_users gu
    where gu.gym_id = p_gym_id
      and gu.user_id = auth.uid()
  );
$$;

-- gyms: 사용자가 속한 도장만 select
drop policy if exists "gyms_select_own" on public.gyms;
create policy "gyms_select_own"
on public.gyms for select
using (public.is_gym_user(id));

-- gym_users: 자기 소속 도장 관계만
drop policy if exists "gym_users_select_own" on public.gym_users;
create policy "gym_users_select_own"
on public.gym_users for select
using (public.is_gym_user(gym_id));

-- members
drop policy if exists "members_crud_own" on public.members;
create policy "members_crud_own"
on public.members for all
using (public.is_gym_user(gym_id))
with check (public.is_gym_user(gym_id));

-- templates
drop policy if exists "templates_crud_own" on public.message_templates;
create policy "templates_crud_own"
on public.message_templates for all
using (public.is_gym_user(gym_id))
with check (public.is_gym_user(gym_id));

-- logs
drop policy if exists "logs_crud_own" on public.message_logs;
create policy "logs_crud_own"
on public.message_logs for all
using (public.is_gym_user(gym_id))
with check (public.is_gym_user(gym_id));

-- view는 기본적으로 underlying table RLS 따름(멤버 테이블 정책 적용됨)