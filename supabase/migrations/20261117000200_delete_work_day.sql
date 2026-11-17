-- Deletes every work session that started on the selected local calendar day.
-- Related breaks, break edits, and session edits are removed by existing CASCADE constraints.
-- A day containing an active session cannot be deleted.

create or replace function public.delete_work_day(
  p_day date,
  p_time_zone text
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_start timestamptz;
  v_end timestamptz;
  v_deleted integer;
begin
  if v_user_id is null then
    raise exception 'Sign in before deleting a work day.' using errcode = '42501';
  end if;
  if p_day is null or p_time_zone is null or not exists (
    select 1 from pg_catalog.pg_timezone_names where name = p_time_zone
  ) then
    raise exception 'A valid local date and timezone are required.';
  end if;

  v_start := p_day::timestamp without time zone at time zone p_time_zone;
  v_end := (p_day + 1)::timestamp without time zone at time zone p_time_zone;

  perform 1 from public.work_sessions
    where user_id = v_user_id and clock_in_at >= v_start and clock_in_at < v_end
    for update;

  if exists (
    select 1 from public.work_sessions
    where user_id = v_user_id and clock_in_at >= v_start and clock_in_at < v_end
      and clock_out_at is null
  ) then
    raise exception 'You cannot delete a day with an active work session. Punch out first.';
  end if;

  delete from public.work_sessions
    where user_id = v_user_id and clock_in_at >= v_start and clock_in_at < v_end;
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.delete_work_day(date, text) from public, anon;
grant execute on function public.delete_work_day(date, text) to authenticated;
