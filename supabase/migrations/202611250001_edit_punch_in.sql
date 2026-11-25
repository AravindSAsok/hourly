-- Allows correcting the punch-in timestamp of a completed historical work session.
-- Corrections are restricted to the authenticated user's own completed sessions,
-- retain an audit trail, and cannot invalidate recorded breaks or overlap other sessions.

create table public.session_punch_in_edits (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  previous_clock_in_at timestamptz not null,
  new_clock_in_at timestamptz not null,
  edited_at timestamptz not null default clock_timestamp(),
  foreign key (session_id, user_id) references public.work_sessions(id, user_id) on delete cascade,
  check (new_clock_in_at <> previous_clock_in_at)
);

alter table public.session_punch_in_edits enable row level security;

create policy "session_punch_in_edits_read_own" on public.session_punch_in_edits
  for select to authenticated using (user_id = (select auth.uid()));

create index session_punch_in_edits_session_edited_idx
  on public.session_punch_in_edits(session_id, edited_at desc);

revoke all on public.session_punch_in_edits from anon, authenticated;
grant select on public.session_punch_in_edits to authenticated;

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

  if v_session.status <> 'completed' or v_session.clock_out_at is null then
    raise exception 'Only completed sessions can be edited.';
  end if;

  if p_clock_in_at is null then
    raise exception 'Provide a punch-in time.';
  end if;

  if p_clock_in_at >= v_session.clock_out_at then
    raise exception 'Punch-in must be before punch-out.';
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
          && tstzrange(p_clock_in_at, v_session.clock_out_at, '[)')
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
