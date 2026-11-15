-- Preserve the user's click time for clock transitions, even when the request
-- takes time to reach the server. The original no-argument RPCs remain available
-- for older clients during rollout.
create function public.clock_in(p_occurred_at timestamptz)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_session_id uuid;
  v_server_now timestamptz := clock_timestamp();
begin
  if v_user_id is null then raise exception 'Sign in before clocking in.' using errcode = '42501'; end if;
  if p_occurred_at is null or p_occurred_at > v_server_now + interval '5 minutes'
     or p_occurred_at < v_server_now - interval '7 days' then
    raise exception 'Invalid clock action timestamp.' using errcode = '22023';
  end if;
  if exists (select 1 from public.work_sessions where user_id = v_user_id and clock_out_at is null) then
    raise exception 'You already have an open work session.' using errcode = 'P0001';
  end if;
  insert into public.work_sessions(user_id, clock_in_at, status)
  values (v_user_id, p_occurred_at, 'working') returning id into v_session_id;
  return v_session_id;
exception when unique_violation then
  raise exception 'You already have an open work session.' using errcode = 'P0001';
end;
$$;

create function public.start_break(p_occurred_at timestamptz)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_session public.work_sessions%rowtype;
  v_break_id uuid;
  v_server_now timestamptz := clock_timestamp();
begin
  if v_user_id is null then raise exception 'Sign in before starting a break.' using errcode = '42501'; end if;
  if p_occurred_at is null or p_occurred_at > v_server_now + interval '5 minutes'
     or p_occurred_at < v_server_now - interval '7 days' then
    raise exception 'Invalid clock action timestamp.' using errcode = '22023';
  end if;
  select * into v_session from public.work_sessions
    where user_id = v_user_id and clock_out_at is null for update;
  if not found then raise exception 'There is no open work session.' using errcode = 'P0001'; end if;
  if v_session.status <> 'working' then raise exception 'This session is already on a break.' using errcode = 'P0001'; end if;
  if p_occurred_at < v_session.clock_in_at then raise exception 'Break time cannot precede the work session.' using errcode = '22023'; end if;
  insert into public.breaks(work_session_id, user_id, break_start_at)
  values(v_session.id, v_user_id, p_occurred_at) returning id into v_break_id;
  update public.work_sessions set status = 'on_break', updated_at = v_server_now where id = v_session.id;
  return v_break_id;
end;
$$;

create function public.end_break(p_occurred_at timestamptz)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_session public.work_sessions%rowtype;
  v_break_id uuid;
  v_break_start timestamptz;
  v_server_now timestamptz := clock_timestamp();
begin
  if v_user_id is null then raise exception 'Sign in before ending a break.' using errcode = '42501'; end if;
  if p_occurred_at is null or p_occurred_at > v_server_now + interval '5 minutes'
     or p_occurred_at < v_server_now - interval '7 days' then
    raise exception 'Invalid clock action timestamp.' using errcode = '22023';
  end if;
  select * into v_session from public.work_sessions
    where user_id = v_user_id and clock_out_at is null for update;
  if not found or v_session.status <> 'on_break' then raise exception 'There is no open break.' using errcode = 'P0001'; end if;
  select id, break_start_at into v_break_id, v_break_start from public.breaks
    where work_session_id = v_session.id and user_id = v_user_id and break_end_at is null for update;
  if v_break_id is null then raise exception 'There is no open break.' using errcode = 'P0001'; end if;
  if p_occurred_at < v_break_start then raise exception 'Break end cannot precede its start.' using errcode = '22023'; end if;
  update public.breaks set break_end_at = p_occurred_at, updated_at = v_server_now where id = v_break_id;
  update public.work_sessions set status = 'working', updated_at = v_server_now where id = v_session.id;
  return v_break_id;
end;
$$;

create function public.clock_out(p_occurred_at timestamptz)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_session public.work_sessions%rowtype;
  v_break_start timestamptz;
  v_server_now timestamptz := clock_timestamp();
begin
  if v_user_id is null then raise exception 'Sign in before clocking out.' using errcode = '42501'; end if;
  if p_occurred_at is null or p_occurred_at > v_server_now + interval '5 minutes'
     or p_occurred_at < v_server_now - interval '7 days' then
    raise exception 'Invalid clock action timestamp.' using errcode = '22023';
  end if;
  select * into v_session from public.work_sessions
    where user_id = v_user_id and clock_out_at is null for update;
  if not found then raise exception 'There is no open work session.' using errcode = 'P0001'; end if;
  if p_occurred_at < v_session.clock_in_at then raise exception 'Punch-out cannot precede punch-in.' using errcode = '22023'; end if;
  if v_session.status = 'on_break' then
    select break_start_at into v_break_start from public.breaks
      where work_session_id = v_session.id and user_id = v_user_id and break_end_at is null for update;
    if not found then raise exception 'The open break could not be closed.' using errcode = 'P0001'; end if;
    if p_occurred_at < v_break_start then raise exception 'Break end cannot precede its start.' using errcode = '22023'; end if;
    update public.breaks set break_end_at = p_occurred_at, updated_at = v_server_now
      where work_session_id = v_session.id and user_id = v_user_id and break_end_at is null;
  end if;
  update public.work_sessions set clock_out_at = p_occurred_at, status = 'completed', updated_at = v_server_now
    where id = v_session.id;
  return v_session.id;
end;
$$;

revoke all on function public.clock_in(timestamptz) from public, anon;
revoke all on function public.start_break(timestamptz) from public, anon;
revoke all on function public.end_break(timestamptz) from public, anon;
revoke all on function public.clock_out(timestamptz) from public, anon;
grant execute on function public.clock_in(timestamptz) to authenticated;
grant execute on function public.start_break(timestamptz) to authenticated;
grant execute on function public.end_break(timestamptz) to authenticated;
grant execute on function public.clock_out(timestamptz) to authenticated;
