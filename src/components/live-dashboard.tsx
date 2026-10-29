"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Coffee, Play, Timer, TriangleAlert } from "lucide-react";
import { ClockAction } from "@/components/clock-action";
import type { Profile, StoredSession } from "@/lib/data";
import { calculateSessionTime, dateKeyForInput, formatDuration, localDayBounds, weekBounds, summarizeWorkingTime } from "@/lib/time";

function timeLabel(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit", timeZone }).format(new Date(value));
}

export function LiveDashboard({ profile, sessions, initialNow }: {
  profile: Profile;
  sessions: StoredSession[];
  initialNow: number;
}) {
  const [now, setNow] = useState(initialNow);
  useEffect(() => {
    const baseline = performance.now();
    const timer = window.setInterval(() => setNow(initialNow + performance.now() - baseline), 1000);
    return () => window.clearInterval(timer);
  }, [initialNow]);

  const activeSession = sessions.find((session) => session.clock_out_at === null) ?? null;
  const activeBreak = activeSession?.breaks.find((item) => item.break_end_at === null) ?? null;
  const currentDate = dateKeyForInput(now, profile.time_zone);
  const today = localDayBounds(currentDate, profile.time_zone);
  const week = weekBounds(currentDate, profile.week_starts_on, profile.time_zone);
  const todayMs = summarizeWorkingTime(sessions, today.start, today.end, now);
  const weekMs = summarizeWorkingTime(sessions, week.start, week.end, now);
  const goalMs = profile.weekly_target_minutes * 60_000;
  const percent = Math.min(100, Math.round((weekMs / goalMs) * 100));
  const sessionTime = activeSession ? calculateSessionTime(activeSession, now) : null;
  const breakMs = activeBreak ? Math.max(0, now - new Date(activeBreak.break_start_at).getTime()) : 0;
  const sessionHours = activeSession ? Math.max(0, (now - new Date(activeSession.clock_in_at).getTime()) / 3_600_000) : 0;
  const todaySessions = sessions.filter((session) => {
    const sessionStart = new Date(session.clock_in_at).getTime();
    const sessionEnd = session.clock_out_at ? new Date(session.clock_out_at).getTime() : now;
    return sessionStart < today.end && sessionEnd > today.start;
  });
  const dayPunchIns = sessions.filter((session) => dateKeyForInput(session.clock_in_at, profile.time_zone) === currentDate);
  const dayPunchOuts = sessions.flatMap((session) => session.clock_out_at && dateKeyForInput(session.clock_out_at, profile.time_zone) === currentDate ? [session.clock_out_at] : []);
  const firstPunch = dayPunchIns.length ? dayPunchIns.reduce((first, session) => session.clock_in_at < first ? session.clock_in_at : first, dayPunchIns[0].clock_in_at) : null;
  const lastPunch = dayPunchOuts.length ? dayPunchOuts.reduce((last, value) => value > last ? value : last, dayPunchOuts[0]) : null;
  const observedBreakToday = todaySessions.reduce((total, session) => total + session.breaks.reduce((sum, item) => {
    const breakStart = new Date(item.break_start_at).getTime();
    const breakEnd = item.break_end_at ? new Date(item.break_end_at).getTime() : now;
    return sum + Math.max(0, Math.min(today.end, breakEnd) - Math.max(today.start, breakStart));
  }, 0), 0);
  const grossToday = todaySessions.reduce((total, session) => {
    const sessionStart = new Date(session.clock_in_at).getTime();
    const sessionEnd = session.clock_out_at ? new Date(session.clock_out_at).getTime() : now;
    return total + Math.max(0, Math.min(today.end, sessionEnd) - Math.max(today.start, sessionStart));
  }, 0);
  const deductedToday = Math.max(0, grossToday - todayMs);

  return <>
    <section className={`status-card ${activeSession ? (activeBreak ? "status-break" : "status-working") : "status-off"}`} aria-labelledby="status-heading">
      <div className="status-main">
        <div className="eyebrow"><span className="status-dot" /> CURRENT STATUS</div>
        <h1 id="status-heading">{activeBreak ? "You’re on a break" : activeSession ? "You’re working" : "You’re off the clock"}</h1>
        <p className="status-subtitle">{activeBreak
          ? `Break started at ${timeLabel(activeBreak.break_start_at, profile.time_zone)}.`
          : activeSession ? `Session started at ${timeLabel(activeSession.clock_in_at, profile.time_zone)}.`
            : "Start a session when you’re ready to work."}</p>
        <div className="live-clock" aria-live="off">{activeBreak ? formatDuration(breakMs, true) : sessionTime ? formatDuration(sessionTime.netWorkMs, true) : "00:00:00"}</div>
        <div className="clock-caption">{activeBreak ? "BREAK DURATION" : activeSession ? "NET SESSION TIME" : "READY WHEN YOU ARE"}</div>
        {activeBreak && <p className="provisional-note">{breakMs >= 15 * 60_000
          ? "This break is provisionally deductible. Its final duration is recorded when it ends."
          : "Under 15 minutes, this break is currently counted as paid working time."}</p>}
        {activeSession && sessionHours >= 14 && <p className="long-session-warning"><TriangleAlert size={16} /> This session has been open for over 14 hours. Review it and punch out when appropriate.</p>}
        <div className="status-actions">
          {!activeSession && <ClockAction operation="clock-in" label="Punch in" className="button button-primary button-large" />}
          {activeSession && !activeBreak && <ClockAction operation="start-break" label="Start break" className="button button-secondary button-large" />}
          {activeBreak && <ClockAction operation="end-break" label="End break" className="button button-primary button-large" />}
          {activeSession && <ClockAction operation="clock-out" label="Punch out" className="button button-danger-outline button-large" confirm="Punch out and close this work session? If a break is in progress, it will end now." />}
        </div>
      </div>
      <div className="status-side" aria-hidden="true">
        <div className="timer-orb"><Timer size={34} strokeWidth={1.35} /></div>
        <div className="orb-line" />
        <span>{activeBreak ? "TAKE YOUR TIME" : activeSession ? "TIME IS TRACKED AUTOMATICALLY" : "YOUR WORKDAY, IN FOCUS"}</span>
      </div>
    </section>

    <section className="stat-grid" aria-label="Time summaries">
      <article className="stat-card"><div className="stat-label"><span>Today</span><span className="stat-icon green"><Timer size={17} /></span></div><div className="stat-value">{formatDuration(todayMs)}</div><div className="stat-foot">Net working time</div></article>
      <article className="stat-card"><div className="stat-label"><span>This week</span><span className="stat-icon blue"><Play size={16} /></span></div><div className="stat-value">{formatDuration(weekMs)}</div><div className="stat-foot">{formatDuration(Math.max(0, goalMs - weekMs))} to weekly target</div></article>
      <article className="stat-card"><div className="stat-label"><span>Weekly target</span><span className="stat-icon amber"><Coffee size={16} /></span></div><div className="stat-value">{formatDuration(goalMs)}</div><div className="stat-foot">Configured in settings</div></article>
    </section>

    <section className="panel today-details" aria-labelledby="today-details-heading">
      <div className="panel-heading"><div><div className="eyebrow">TODAY’S SUMMARY</div><h2 id="today-details-heading">Your punches and breaks</h2></div><span className="muted">{todaySessions.length} {todaySessions.length === 1 ? "session" : "sessions"}</span></div>
      <div className="today-detail-grid">
        <div><span>First punch in</span><strong>{firstPunch ? timeLabel(firstPunch, profile.time_zone) : "—"}</strong></div>
        <div><span>Last punch out</span><strong>{lastPunch ? timeLabel(lastPunch, profile.time_zone) : activeSession ? "In progress" : "—"}</strong></div>
        <div><span>Break time recorded</span><strong>{formatDuration(observedBreakToday, true)}</strong></div>
        <div><span>Break time deducted</span><strong>{formatDuration(deductedToday, true)}</strong></div>
      </div>
    </section>

    <section className="panel weekly-panel" aria-labelledby="weekly-heading">
      <div className="panel-heading"><div><div className="eyebrow">WEEKLY PROGRESS</div><h2 id="weekly-heading">Your week at a glance</h2></div><span className="progress-percentage">{percent}%</span></div>
      <div className="progress-track" role="progressbar" aria-label="Weekly target progress" aria-valuenow={Math.min(100, percent)} aria-valuemin={0} aria-valuemax={100}><div className="progress-fill" style={{ width: `${percent}%` }} /></div>
      <div className="progress-caption"><span>{formatDuration(weekMs)} completed</span><span>{weekMs >= goalMs ? "Weekly target reached" : `${formatDuration(goalMs - weekMs)} remaining`}</span></div>
    </section>

    <section className="panel rule-panel">
      <div className="rule-symbol"><Coffee size={20} /></div>
      <div><strong>Breaks under 15 minutes count as paid time.</strong><p>Once a break reaches 15 minutes, its full duration is deducted. Short breaks are still recorded with their actual start and end.</p></div>
    </section>

    <section className="panel recent-panel" aria-labelledby="recent-heading">
      <div className="panel-heading"><div><div className="eyebrow">RECENT ACTIVITY</div><h2 id="recent-heading">Latest sessions</h2></div><Link className="text-link" href="/history">Full history <ArrowRight size={15} /></Link></div>
      {sessions.length === 0 ? <p className="recent-empty">No sessions yet. Punch in to start your first one.</p> : <div className="recent-list">
        {sessions.slice(0, 4).map((session) => {
          const result = calculateSessionTime(session, now);
          return <div key={session.id} className="recent-row">
            <span className={`recent-dot ${session.clock_out_at ? "done" : session.status === "on_break" ? "break" : "live"}`} />
            <div className="recent-copy"><strong>{new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: profile.time_zone }).format(new Date(session.clock_in_at))}</strong><span>{timeLabel(session.clock_in_at, profile.time_zone)} – {session.clock_out_at ? timeLabel(session.clock_out_at, profile.time_zone) : "In progress"}</span></div>
            <span className="recent-duration">{formatDuration(result.netWorkMs)}</span>
          </div>;
        })}
      </div>}
    </section>
  </>;
}
