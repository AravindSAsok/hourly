-- Allows correcting a completed break that belongs to an active work session.
--
-- 1. public.edit_break previously had two branches:
--    - Active session: only the open (break_end_at IS NULL) break could be edited.
--    - Completed session: any break in a completed session could be edited.
--    A completed break in an active session matched neither branch and was rejected.
--
-- 2. This migration adds a third branch: when the work session is active
--    (clock_out_at IS NULL) and the break is already completed
--    (break_end_at IS NOT NULL), the break's timestamps may be corrected.
--    Only the break row is updated; clock_in_at / clock_out_at are never touched;
--    the session status stays 'working' and clock_out is never invoked.
--
-- 3. The 15-minute break deduction policy is preserved by the existing
--    client-side calculations in src/lib/time.ts.

create or replace function public.edit_break(
  p_break_id uuid,
  p_start_at timestamptz,
  p_end_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_break public.breaks%rowtype;
  v_session public.work_sessions%rowtype;
  v_now timestamptz := clock_timestamp();
  v_new_start timestamptz;
  v_new_end timestamptz;
begin
  if v_user_id is null then raise exception 'Sign in before editing a break.' using errcode = '42501'; end if;

  select * into v_break from public.breaks where id = p_break_id and user_id = v_user_id;
  if not found then raise exception 'Break not found.' using errcode = 'P0002'; end if;

  select * into v_session from public.work_sessions
    where id = v_break.work_session_id and user_id = v_user_id for update;
  if not found then raise exception 'Work session not found.' using errcode = 'P0002'; end if;

  select * into v_break from public.breaks where id = p_break_id and user_id = v_user_id for update;
  if not found then raise exception 'Break not found.' using errcode = 'P0002'; end if;

  if v_session.clock_out_at is null then
    -- Active work session.
    if v_break.break_end_at is null then
      -- Active break (still open): correct the open break.
      if p_end_at is null then
        raise exception 'Provide an end time to complete the break.' using errcode = 'P0002';
      end if;
      v_new_start := coalesce(p_start_at, v_break.break_start_at);
      v_new_end := p_end_at;
      if v_new_end <= v_new_start then
        raise exception 'Break end must be after the break start.';
      end if;
      if v_new_end > v_now then
        raise exception 'Break end cannot be in the future.';
      end if;
      if v_new_start < v_session.clock_in_at then
        raise exception 'Break start cannot be before the session punch-in.';
      end if;
      if exists (
        select 1 from public.breaks other_break
        where other_break.work_session_id = v_session.id and other_break.id <> p_break_id
          and tstzrange(other_break.break_start_at, coalesce(other_break.break_end_at, 'infinity'::timestamptz), '[)')
              && tstzrange(v_new_start, v_new_end, '[)')
      ) then raise exception 'Breaks in the same session cannot overlap.'; end if;

      insert into public.break_edits(
        break_id, user_id, previous_break_start_at, previous_break_end_at, new_break_start_at, new_break_end_at
      ) values (
        p_break_id, v_user_id, v_break.break_start_at, v_break.break_end_at, v_new_start, v_new_end
      );
      update public.breaks set break_start_at = v_new_start, break_end_at = v_new_end, updated_at = v_now
        where id = p_break_id;
      update public.work_sessions set status = 'working', updated_at = v_now
        where id = v_session.id and status = 'on_break';
    else
      -- Completed break in an active session: correct the completed break.
      -- The session stays open; clock_in_at / clock_out_at are never modified.
      if p_start_at is null or p_end_at is null or p_end_at <= p_start_at
         or p_start_at < v_session.clock_in_at or p_end_at > v_now then
        raise exception 'Break times must be ordered and remain inside their work session.';
      end if;
      if exists (
        select 1 from public.breaks other_break
        where other_break.work_session_id = v_session.id and other_break.id <> p_break_id
          and tstzrange(other_break.break_start_at, coalesce(other_break.break_end_at, 'infinity'::timestamptz), '[)')
              && tstzrange(p_start_at, p_end_at, '[)')
      ) then raise exception 'Breaks in the same session cannot overlap.'; end if;

      insert into public.break_edits(
        break_id, user_id, previous_break_start_at, previous_break_end_at, new_break_start_at, new_break_end_at
      ) values (
        p_break_id, v_user_id, v_break.break_start_at, v_break.break_end_at, p_start_at, p_end_at
      );
      update public.breaks set break_start_at = p_start_at, break_end_at = p_end_at, updated_at = v_now
        where id = p_break_id;
    end if;
  else
    -- Completed work session: preserve existing behaviour for historical break corrections.
    if p_start_at is null or p_end_at is null or p_end_at <= p_start_at
       or p_start_at < v_session.clock_in_at or p_end_at > v_session.clock_out_at then
      raise exception 'Break times must be ordered and remain inside their work session.';
    end if;
    if exists (
      select 1 from public.breaks other_break
      where other_break.work_session_id = v_session.id and other_break.id <> p_break_id
        and tstzrange(other_break.break_start_at, coalesce(other_break.break_end_at, 'infinity'::timestamptz), '[)')
            && tstzrange(p_start_at, p_end_at, '[)')
    ) then raise exception 'Breaks in the same session cannot overlap.'; end if;

    insert into public.break_edits(
      break_id, user_id, previous_break_start_at, previous_break_end_at, new_break_start_at, new_break_end_at
    ) values (
      p_break_id, v_user_id, v_break.break_start_at, v_break.break_end_at, p_start_at, p_end_at
    );
    update public.breaks set break_start_at = p_start_at, break_end_at = p_end_at, updated_at = clock_timestamp()
      where id = p_break_id;
  end if;

  update public.work_sessions set manually_edited = true, updated_at = clock_timestamp() where id = v_session.id;
end;
$$;

revoke all on function public.edit_break(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.edit_break(uuid, timestamptz, timestamptz) to authenticated;
