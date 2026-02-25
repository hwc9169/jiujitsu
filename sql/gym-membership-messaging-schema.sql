-- 0) Extensions
create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;

-- 1) Enums
do $$
begin
  if not exists (select 1 from pg_type where typname = 'message_type') then
    create type message_type as enum ('EXPIRING', 'OVERDUE', 'NOTICE');
  end if;

  if not exists (select 1 from pg_type where typname = 'message_status') then
    create type message_status as enum ('PENDING', 'SENT', 'FAILED');
  end if;

  if not exists (select 1 from pg_type where typname = 'gym_role') then
    create type gym_role as enum ('OWNER', 'STAFF');
  end if;
end$$;

-- 2) gyms
create table if not exists public.gyms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

-- 3) gym_users (사용자-도장 연결)
create table if not exists public.gym_users (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role gym_role not null default 'OWNER',
  created_at timestamptz not null default now(),
  unique (gym_id, user_id)
);

create index if not exists idx_gym_users_user_id on public.gym_users(user_id);
create index if not exists idx_gym_users_gym_id on public.gym_users(gym_id);

-- 4) members
create table if not exists public.members (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms(id) on delete cascade,

  name text not null,
  phone text not null,
  start_date date null,
  expire_date date not null,
  memo text null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null
);

-- 전화번호 중복 허용 여부:
-- 보통은 중복 방지하는 게 운영에 좋음(단, 가족/동일번호 이슈 가능)
-- MVP에서는 "같은 gym 내 중복 방지" 추천 (soft delete 고려한 partial unique)
create unique index if not exists uq_members_gym_phone_active
on public.members(gym_id, phone)
where deleted_at is null;

create index if not exists idx_members_gym_expire_date on public.members(gym_id, expire_date)
where deleted_at is null;

create index if not exists idx_members_gym_created_at on public.members(gym_id, created_at)
where deleted_at is null;

-- updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

drop trigger if exists trg_members_set_updated_at on public.members;
create trigger trg_members_set_updated_at
before update on public.members
for each row execute function public.set_updated_at();

-- 5) message_templates
create table if not exists public.message_templates (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms(id) on delete cascade,
  type message_type not null,
  title text not null,
  body text not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),

  -- gym 내 타입+디폴트는 1개만(선택)
  unique (gym_id, type, is_default)
);

create index if not exists idx_templates_gym on public.message_templates(gym_id);

-- 6) message_logs
create table if not exists public.message_logs (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms(id) on delete cascade,
  member_id uuid null references public.members(id) on delete set null,

  type message_type not null,
  template_id uuid null references public.message_templates(id) on delete set null,

  to_phone text not null,
  body text not null,

  status message_status not null default 'PENDING',
  provider_message_id text null, -- SMS 업체 메시지 ID
  error_code text null,
  error_message text null,

  sent_at timestamptz null,
  created_at timestamptz not null default now()
);

create index if not exists idx_logs_gym_created_at on public.message_logs(gym_id, created_at);

-- 7) 회원 상태 계산용 VIEW (저장 X)
drop view if exists public.v_members_with_status;
create view public.v_members_with_status as
select
  m.*,
  case
    when m.deleted_at is not null then 'DELETED'
    when m.expire_date < current_date then 'OVERDUE'
    when m.expire_date <= (current_date + 7) then 'EXPIRING'
    else 'NORMAL'
  end as status
from public.members m;

-- 8) 기본 템플릿 삽입 함수(도장 생성 후 1회 실행용)
create or replace function public.seed_default_templates(p_gym_id uuid)
returns void language plpgsql
SET search_path = public
AS $$
begin
  insert into public.message_templates(gym_id, type, title, body, is_default)
  values
    (p_gym_id, 'EXPIRING', '만료 예정 안내', '[도장명] 회원권 만료가 {DAYS_LEFT}일 남았습니다. 연장 원하시면 답장/문의 주세요.', true),
    (p_gym_id, 'OVERDUE',  '미납 안내',     '[도장명] 회원권이 만료되었습니다. 연장/결제 확인 부탁드립니다. 문의: {PHONE}', true),
    (p_gym_id, 'NOTICE',   '일반 공지',     '[도장명] 공지드립니다: {CONTENT}', true)
  on conflict do nothing;
end$$;