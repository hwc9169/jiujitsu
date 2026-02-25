alter table public.members
  add column if not exists gender text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'members_gender_check'
  ) then
    alter table public.members
      add constraint members_gender_check check (gender in ('남', '여'));
  end if;
end $$;
