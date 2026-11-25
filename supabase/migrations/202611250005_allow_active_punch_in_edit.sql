-- Extend punch-in corrections to the currently open work session.
-- Completed-session behavior, ownership checks, audit logging, and break rules remain intact.

create or replace function public.edit_session_punch_in(
  p_session_id uuid,
  p_clock_in_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_session public.work_sessions%rowtype;
  v_now timestamptz := clock_timestamp();
  v_session_end timestamptz;
begin
  if v_user_id is null then
    raise exception 'Sign in before editing a session.' using errcode = '42501';
  end if;

  select * into v_session
  from public.work_sessions
  where id = p_session_id and user_id = v_user_id
  for update;

  if not found then
    raise exception 'Work session not found.' using errcode = 'P0002';
  end if;

  if v_session.clock_out_at is null then
    if v_session.status not in ('working', 'on_break') then
      raise exception 'Only an active or completed session can be edited.';
    end if;
    v_session_end := v_now;
  else
    if v_session.status <> 'completed' then
      raise exception 'Only an active or completed session can be edited.';
    end if;
    v_session_end := v_session.clock_out_at;
  end if;

  if p_clock_in_at is null then
    raise exception 'Provide a punch-in time.';
  end if;

  if p_clock_in_at >= v_session_end then
    raise exception 'Punch-in must be before the current session time or punch-out.';
  end if;

  if p_clock_in_at > v_now then
    raise exception 'Punch-in cannot be in the future.';
  end if;

  if p_clock_in_at = v_session.clock_in_at then
    raise exception 'Choose a different punch-in time.';
  end if;

  if exists (
    select 1 from public.breaks
    where work_session_id = v_session.id and user_id = v_user_id
      and break_start_at < p_clock_in_at
  ) then
    raise exception 'Punch-in cannot be later than the start of a recorded break.';
  end if;

  if exists (
    select 1 from public.work_sessions other_session
    where other_session.user_id = v_user_id
      and other_session.id <> p_session_id
      and tstzrange(other_session.clock_in_at, coalesce(other_session.clock_out_at, 'infinity'::timestamptz), '[)')
          && tstzrange(p_clock_in_at, v_session_end, '[)')
  ) then
    raise exception 'Session would overlap with another session.';
  end if;

  insert into public.session_punch_in_edits(
    session_id, user_id, previous_clock_in_at, new_clock_in_at
  ) values (
    p_session_id, v_user_id, v_session.clock_in_at, p_clock_in_at
  );

  update public.work_sessions
  set clock_in_at = p_clock_in_at,
      manually_edited = true,
      updated_at = v_now
  where id = p_session_id;
end;
$$;

revoke all on function public.edit_session_punch_in(uuid, timestamptz) from public, anon;
grant execute on function public.edit_session_punch_in(uuid, timestamptz) to authenticated;
