create or replace function public.dashboard_counts(p_gym_id uuid)
returns json
language sql
stable
SET search_path = public
as $$
  select json_build_object(
    'overdue_count',
      count(*) filter (
        where gym_id = p_gym_id
          and deleted_at is null
          and expire_date < current_date
      ),

    'expiring_7d_count',
      count(*) filter (
        where gym_id = p_gym_id
          and deleted_at is null
          and expire_date between current_date and (current_date + 7)
      ),

    'new_this_month',
      count(*) filter (
        where gym_id = p_gym_id
          and deleted_at is null
          and date_trunc('month', created_at) = date_trunc('month', now())
      )
  )
  from public.members;
$$;

-- 권한(서비스 롤/서버에서 호출이라면 없어도 되지만, 깔끔하게 열어두려면)
grant execute on function public.dashboard_counts(uuid) to anon, authenticated, service_role;