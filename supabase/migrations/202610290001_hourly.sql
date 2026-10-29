create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  weekly_target_minutes integer not null default 2400 check (weekly_target_minutes between 60 and 10080),
  week_starts_on smallint not null default 1 check (week_starts_on between 0 and 6),
  time_zone text not null default 'UTC',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.work_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  clock_in_at timestamptz not null default clock_timestamp(),
  clock_out_at timestamptz,
  status text not null default 'working' check (status in ('working', 'on_break', 'completed')),
  manually_edited boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  check (clock_out_at is null or clock_out_at >= clock_in_at),
  check ((status = 'completed') = (clock_out_at is not null))
);

create table public.breaks (
  id uuid primary key default gen_random_uuid(),
  work_session_id uuid not null,
  user_id uuid not null,
  break_start_at timestamptz not null default clock_timestamp(),
  break_end_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (work_session_id, user_id) references public.work_sessions(id, user_id) on delete cascade,
  check (break_end_at is null or break_end_at >= break_start_at)
);

create table public.break_edits (
  id uuid primary key default gen_random_uuid(),
  break_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  previous_break_start_at timestamptz not null,
  previous_break_end_at timestamptz not null,
  new_break_start_at timestamptz not null,
  new_break_end_at timestamptz not null,
  edited_at timestamptz not null default clock_timestamp(),
  foreign key (break_id, user_id) references public.breaks(id, user_id) on delete cascade,
  check (previous_break_end_at >= previous_break_start_at),
  check (new_break_end_at >= new_break_start_at)
);

create unique index work_sessions_one_open_per_user
  on public.work_sessions(user_id) where clock_out_at is null;
create unique index breaks_one_open_per_session
  on public.breaks(work_session_id) where break_end_at is null;
create index work_sessions_user_clock_in_idx on public.work_sessions(user_id, clock_in_at desc);
create index work_sessions_user_clock_out_idx on public.work_sessions(user_id, clock_out_at);
create index breaks_session_start_idx on public.breaks(work_session_id, break_start_at);
create index breaks_user_start_idx on public.breaks(user_id, break_start_at desc);
create index break_edits_break_edited_idx on public.break_edits(break_id, edited_at desc);
create index break_edits_user_edited_idx on public.break_edits(user_id, edited_at desc);

create function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  requested_zone text := new.raw_user_meta_data ->> 'time_zone';
begin
  if requested_zone is null or not exists (select 1 from pg_timezone_names where name = requested_zone) then
    requested_zone := 'UTC';
  end if;
  insert into public.profiles (id, display_name, time_zone)
  values (new.id, nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), requested_zone)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row execute function public.create_profile_for_new_user();

alter table public.profiles enable row level security;
alter table public.work_sessions enable row level security;
alter table public.breaks enable row level security;
alter table public.break_edits enable row level security;

create policy "profiles_read_own" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "sessions_read_own" on public.work_sessions
  for select to authenticated using (user_id = (select auth.uid()));
create policy "breaks_read_own" on public.breaks
  for select to authenticated using (user_id = (select auth.uid()));
create policy "break_edits_read_own" on public.break_edits
  for select to authenticated using (user_id = (select auth.uid()));

revoke all on public.profiles, public.work_sessions, public.breaks, public.break_edits from anon, authenticated;
grant select on public.profiles, public.work_sessions, public.breaks, public.break_edits to authenticated;

create function public.clock_in()
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_session_id uuid;
begin
  if v_user_id is null then raise exception 'Sign in before clocking in.' using errcode = '42501'; end if;
  if exists (select 1 from public.work_sessions where user_id = v_user_id and clock_out_at is null) then
    raise exception 'You already have an open work session.' using errcode = 'P0001';
  end if;
  insert into public.work_sessions(user_id, clock_in_at, status)
  values (v_user_id, clock_timestamp(), 'working') returning id into v_session_id;
  return v_session_id;
exception when unique_violation then
  raise exception 'You already have an open work session.' using errcode = 'P0001';
end;
$$;

create function public.start_break()
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_session public.work_sessions%rowtype;
  v_break_id uuid;
begin
  if v_user_id is null then raise exception 'Sign in before starting a break.' using errcode = '42501'; end if;
  select * into v_session from public.work_sessions
    where user_id = v_user_id and clock_out_at is null for update;
  if not found then raise exception 'There is no open work session.' using errcode = 'P0001'; end if;
  if v_session.status <> 'working' then raise exception 'This session is already on a break.' using errcode = 'P0001'; end if;
  insert into public.breaks(work_session_id, user_id, break_start_at)
  values(v_session.id, v_user_id, clock_timestamp()) returning id into v_break_id;
  update public.work_sessions set status = 'on_break', updated_at = clock_timestamp() where id = v_session.id;
  return v_break_id;
end;
$$;

create function public.end_break()
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_session public.work_sessions%rowtype;
  v_break_id uuid;
  v_now timestamptz;
begin
  if v_user_id is null then raise exception 'Sign in before ending a break.' using errcode = '42501'; end if;
  select * into v_session from public.work_sessions
    where user_id = v_user_id and clock_out_at is null for update;
  if not found or v_session.status <> 'on_break' then raise exception 'There is no open break.' using errcode = 'P0001'; end if;
  v_now := clock_timestamp();
  update public.breaks set break_end_at = v_now, updated_at = v_now
    where work_session_id = v_session.id and user_id = v_user_id and break_end_at is null
    returning id into v_break_id;
  if v_break_id is null then raise exception 'There is no open break.' using errcode = 'P0001'; end if;
  update public.work_sessions set status = 'working', updated_at = v_now where id = v_session.id;
  return v_break_id;
end;
$$;

create function public.clock_out()
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_session public.work_sessions%rowtype;
  v_now timestamptz;
begin
  if v_user_id is null then raise exception 'Sign in before clocking out.' using errcode = '42501'; end if;
  select * into v_session from public.work_sessions
    where user_id = v_user_id and clock_out_at is null for update;
  if not found then raise exception 'There is no open work session.' using errcode = 'P0001'; end if;
  v_now := clock_timestamp();
  if v_session.status = 'on_break' then
    update public.breaks set break_end_at = v_now, updated_at = v_now
      where work_session_id = v_session.id and user_id = v_user_id and break_end_at is null;
    if not found then raise exception 'The open break could not be closed.' using errcode = 'P0001'; end if;
  end if;
  update public.work_sessions set clock_out_at = v_now, status = 'completed', updated_at = v_now
    where id = v_session.id;
  return v_session.id;
end;
$$;

create function public.update_preferences(
  p_display_name text,
  p_weekly_target_minutes integer,
  p_week_starts_on smallint,
  p_time_zone text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'Sign in before updating preferences.' using errcode = '42501'; end if;
  if p_weekly_target_minutes not between 60 and 10080 then raise exception 'Weekly target must be between 1 minute and 7 days.'; end if;
  if p_week_starts_on not between 0 and 6 then raise exception 'Choose a valid first day of the week.'; end if;
  if not exists (select 1 from pg_timezone_names where name = p_time_zone) then raise exception 'Choose a valid timezone.'; end if;
  update public.profiles set
    display_name = nullif(trim(p_display_name), ''),
    weekly_target_minutes = p_weekly_target_minutes,
    week_starts_on = p_week_starts_on,
    time_zone = p_time_zone,
    updated_at = clock_timestamp()
  where id = v_user_id;
  if not found then raise exception 'Your profile could not be found.'; end if;
end;
$$;

create function public.edit_break(
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
  v_work_session_id uuid;
  v_break public.breaks%rowtype;
  v_session public.work_sessions%rowtype;
begin
  if v_user_id is null then raise exception 'Sign in before editing a break.' using errcode = '42501'; end if;
  select work_session_id into v_work_session_id from public.breaks where id = p_break_id and user_id = v_user_id;
  if not found then raise exception 'Break not found.' using errcode = 'P0002'; end if;
  select * into v_session from public.work_sessions where id = v_work_session_id and user_id = v_user_id for update;
  if not found or v_session.status <> 'completed' then raise exception 'Only a completed session can be edited.'; end if;
  select * into v_break from public.breaks where id = p_break_id and user_id = v_user_id for update;
  if not found then raise exception 'Break not found.' using errcode = 'P0002'; end if;
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
  update public.work_sessions set manually_edited = true, updated_at = clock_timestamp() where id = v_session.id;
end;
$$;

revoke all on function public.clock_in() from public, anon;
revoke all on function public.start_break() from public, anon;
revoke all on function public.end_break() from public, anon;
revoke all on function public.clock_out() from public, anon;
revoke all on function public.update_preferences(text, integer, smallint, text) from public, anon;
revoke all on function public.edit_break(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.clock_in() to authenticated;
grant execute on function public.start_break() to authenticated;
grant execute on function public.end_break() to authenticated;
grant execute on function public.clock_out() to authenticated;
grant execute on function public.update_preferences(text, integer, smallint, text) to authenticated;
grant execute on function public.edit_break(uuid, timestamptz, timestamptz) to authenticated;
