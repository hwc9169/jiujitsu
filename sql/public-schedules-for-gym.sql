-- public schedule sharing settings by gym
-- note: access code is stored as plain text for now (scaffolding). hash migration can be added in v1.1.

alter table if exists public.gyms
  add column if not exists public_schedule_enabled boolean not null default false,
  add column if not exists public_schedule_slug text,
  add column if not exists public_schedule_access_code text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'gyms_public_schedule_slug_format_check'
      and conrelid = 'public.gyms'::regclass
  ) then
    alter table public.gyms
      add constraint gyms_public_schedule_slug_format_check
      check (
        public_schedule_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
        and char_length(public_schedule_slug) between 3 and 64
      );
  end if;
end $$;

do $$
declare
  row_data record;
  base_slug text;
  candidate_slug text;
  suffix_number integer;
begin
  for row_data in
    select id, name, public_schedule_slug
    from public.gyms
  loop
    base_slug := regexp_replace(
      lower(
        coalesce(
          nullif(trim(row_data.public_schedule_slug), ''),
          nullif(trim(row_data.name), ''),
          'gym'
        )
      ),
      '[^a-z0-9]+',
      '-',
      'g'
    );
    base_slug := regexp_replace(base_slug, '(^-+|-+$)', '', 'g');

    if char_length(base_slug) < 3 then
      base_slug := 'gym-' || substring(replace(row_data.id::text, '-', '') from 1 for 6);
    end if;

    if char_length(base_slug) > 58 then
      base_slug := left(base_slug, 58);
      base_slug := regexp_replace(base_slug, '-+$', '', 'g');
    end if;

    candidate_slug := base_slug;
    suffix_number := 1;

    while exists (
      select 1
      from public.gyms g
      where g.public_schedule_slug = candidate_slug
        and g.id <> row_data.id
    ) loop
      candidate_slug := left(base_slug, 58) || '-' || suffix_number::text;
      if char_length(candidate_slug) > 64 then
        candidate_slug := left(base_slug, 64 - char_length(suffix_number::text) - 1) || '-' || suffix_number::text;
      end if;
      suffix_number := suffix_number + 1;
    end loop;

    update public.gyms
    set public_schedule_slug = candidate_slug
    where id = row_data.id;
  end loop;
end $$;

alter table public.gyms
  alter column public_schedule_slug set not null;

create unique index if not exists idx_gyms_public_schedule_slug_unique
  on public.gyms (public_schedule_slug);

grant select, update on table public.gyms to service_role;
