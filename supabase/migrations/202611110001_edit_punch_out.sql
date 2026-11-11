-- Allows correcting the punch-out timestamp of a completed historical work session.
--
-- 1. Creates public.session_edits to audit punch-out corrections, following the
--    same pattern as public.break_edits for break corrections.
--
-- 2. Creates public.edit_session_punch_out RPC so an authenticated user can
--    correct only the clock_out_at of their own completed session. The RPC:
--    - locks the session row with FOR UPDATE
--    - rejects non-completed sessions and other users' sessions
--    - never touches clock_in_at
--    - rejects future punch-out times
--    - requires punch-out strictly after punch-in
--    - requires punch-out not earlier than any recorded break end
--    - prevents overlap with other sessions belonging to the same user
--    - writes an audit row and marks manually_edited = true
--
-- 3. Existing break audit functionality is not modified.

create table public.session_edits (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  previous_clock_out_at timestamptz not null,
  new_clock_out_at timestamptz not null,
  edited_at timestamptz not null default clock_timestamp(),
  foreign key (session_id, user_id) references public.work_sessions(id, user_id) on delete cascade
);

alter table public.session_edits enable row level security;

create policy "session_edits_read_own" on public.session_edits
  for select to authenticated using (user_id = (select auth.uid()));

create index session_edits_session_edited_idx
  on public.session_edits(session_id, edited_at desc);

revoke all on public.session_edits from anon, authenticated;
grant select on public.session_edits to authenticated;

create or replace function public.edit_session_punch_out(
  p_session_id uuid,
  p_clock_out_at timestamptz
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
  if v_user_id is null then raise exception 'Sign in before editing a session.' using errcode = '42501'; end if;

  select * into v_session from public.work_sessions
    where id = p_session_id and user_id = v_user_id for update;
  if not found then raise exception 'Work session not found.' using errcode = 'P0002'; end if;

  if v_session.status <> 'completed' then
    raise exception 'Only completed sessions can be edited.' using errcode = 'P0002';
  end if;

  if p_clock_out_at is null then
    raise exception 'Provide a punch-out time.' using errcode = 'P0002';
  end if;

  if p_clock_out_at <= v_session.clock_in_at then
    raise exception 'Punch-out must be after punch-in.';
  end if;

  if p_clock_out_at > v_now then
    raise exception 'Punch-out cannot be in the future.';
  end if;

  if exists (
    select 1 from public.breaks
    where work_session_id = v_session.id and user_id = v_user_id
      and break_end_at is not null
      and break_end_at > p_clock_out_at
  ) then
    raise exception 'Punch-out cannot be earlier than the end of a recorded break.';
  end if;

  if exists (
    select 1 from public.work_sessions other_session
    where other_session.user_id = v_user_id
      and other_session.id <> p_session_id
      and tstzrange(other_session.clock_in_at, coalesce(other_session.clock_out_at, 'infinity'::timestamptz), '[)')
          && tstzrange(v_session.clock_in_at, p_clock_out_at, '[)')
  ) then
    raise exception 'Session would overlap with another session.';
  end if;

  insert into public.session_edits(
    session_id, user_id, previous_clock_out_at, new_clock_out_at
  ) values (
    p_session_id, v_user_id, v_session.clock_out_at, p_clock_out_at
  );

  update public.work_sessions
    set clock_out_at = p_clock_out_at,
        manually_edited = true,
        updated_at = v_now
    where id = p_session_id;
end;
$$;

revoke all on function public.edit_session_punch_out(uuid, timestamptz) from public, anon;
grant execute on function public.edit_session_punch_out(uuid, timestamptz) to authenticated;
