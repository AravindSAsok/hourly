alter table public.profiles
  add column planned_leaving_time text not null default '17:30'
  check (planned_leaving_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');

create function public.update_planned_leaving_time(p_planned_leaving_time text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'Sign in before updating your planned leaving time.' using errcode = '42501'; end if;
  if p_planned_leaving_time is null or p_planned_leaving_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
    raise exception 'Choose a valid planned leaving time.';
  end if;
  update public.profiles set
    planned_leaving_time = p_planned_leaving_time,
    updated_at = clock_timestamp()
  where id = v_user_id;
  if not found then raise exception 'Your profile could not be found.'; end if;
end;
$$;

revoke all on function public.update_planned_leaving_time(text) from public, anon;
grant execute on function public.update_planned_leaving_time(text) to authenticated;
