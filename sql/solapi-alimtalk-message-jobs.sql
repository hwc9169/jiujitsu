-- Solapi Alimtalk message jobs/outbox schema

alter table public.gyms
  add column if not exists contact_phone text;

create table if not exists public.message_jobs (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms(id) on delete cascade,
  requested_by uuid null references auth.users(id) on delete set null,
  mode text not null default 'bulk' check (mode in ('bulk')),
  template_key text not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'partial_failed', 'failed')),
  requested_count integer not null default 0,
  sent_count integer not null default 0,
  failed_count integer not null default 0,
  blocked_count integer not null default 0,
  provider_group_id text null,
  provider_response jsonb null,
  error_message text null,
  created_at timestamptz not null default now(),
  sent_at timestamptz null,
  completed_at timestamptz null
);

create index if not exists idx_message_jobs_gym_created_at
  on public.message_jobs(gym_id, created_at desc);

create table if not exists public.message_outbox (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.message_jobs(id) on delete cascade,
  gym_id uuid not null references public.gyms(id) on delete cascade,
  member_id uuid null references public.members(id) on delete set null,
  member_name text not null,
  to_phone text not null,
  template_key text not null,
  template_variables jsonb not null,
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed', 'blocked')),
  provider_group_id text null,
  provider_message_id text null,
  provider_status text null,
  provider_response jsonb null,
  error_message text null,
  created_at timestamptz not null default now(),
  sent_at timestamptz null
);

create index if not exists idx_message_outbox_job_id
  on public.message_outbox(job_id);

create index if not exists idx_message_outbox_gym_created_at
  on public.message_outbox(gym_id, created_at desc);

alter table public.message_jobs enable row level security;
alter table public.message_outbox enable row level security;

drop policy if exists "message_jobs_crud_own" on public.message_jobs;
create policy "message_jobs_crud_own"
on public.message_jobs for all
using (
  gym_id in (select gym_id from public.gym_users where user_id = auth.uid())
)
with check (
  gym_id in (select gym_id from public.gym_users where user_id = auth.uid())
);

drop policy if exists "message_outbox_crud_own" on public.message_outbox;
create policy "message_outbox_crud_own"
on public.message_outbox for all
using (
  gym_id in (select gym_id from public.gym_users where user_id = auth.uid())
)
with check (
  gym_id in (select gym_id from public.gym_users where user_id = auth.uid())
);
