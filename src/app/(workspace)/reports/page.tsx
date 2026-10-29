import Link from "next/link";
import { ArrowLeft, ArrowRight, Download, TrendingUp } from "lucide-react";
import { getProfileAndUser, getSessionsOverlapping } from "@/lib/data";
import { addLocalDays, dateKeyForInput, formatDuration, localDayBounds, startOfWeekDateKey, summarizeWorkingTime, weekBounds } from "@/lib/time";

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const [{ profile }, query] = await Promise.all([getProfileAndUser(), searchParams]);
  const now = Date.now();
  let candidate = dateKeyForInput(now, profile.time_zone);
  if (query.week && /^\d{4}-\d{2}-\d{2}$/.test(query.week)) {
    try { startOfWeekDateKey(query.week, profile.week_starts_on); candidate = query.week; } catch { /* Ignore malformed report dates and show the current week. */ }
  }
  const weekStartKey = startOfWeekDateKey(candidate, profile.week_starts_on);
  const bounds = weekBounds(weekStartKey, profile.week_starts_on, profile.time_zone);
  const sessions = await getSessionsOverlapping(bounds.start, bounds.end);
  const total = summarizeWorkingTime(sessions, bounds.start, bounds.end, now);
  const target = profile.weekly_target_minutes * 60_000;
  const percent = Math.min(100, Math.round(total / target * 100));
  const previous = addLocalDays(weekStartKey, -7);
  const next = addLocalDays(weekStartKey, 7);
  const rangeLabel = `${new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: profile.time_zone }).format(new Date(bounds.start))} – ${new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric", timeZone: profile.time_zone }).format(new Date(bounds.end - 1))}`;

  return <div className="page-stack">
    <div className="page-heading"><div><div className="eyebrow">YOUR HOURS, IN CONTEXT</div><h1>Weekly reports</h1><p>See how your work time adds up across the week.</p></div><a className="button button-secondary" href={`/api/reports/export?week=${weekStartKey}`}><Download size={16} /> Export CSV</a></div>
    <section className="panel report-range">
      <Link className="icon-button" aria-label="Previous week" href={`/reports?week=${previous}`}><ArrowLeft size={18} /></Link>
      <div className="range-center"><strong>{rangeLabel}</strong><span>Week of {weekStartKey}</span></div>
      {next > dateKeyForInput(now, profile.time_zone)
        ? <span className="icon-button disabled-link" aria-label="Next week is not available yet"><ArrowRight size={18} /></span>
        : <Link className="icon-button" aria-label="Next week" href={`/reports?week=${next}`}><ArrowRight size={18} /></Link>}
    </section>
    <section className="report-hero">
      <div className="report-hero-label"><TrendingUp size={17} /> WEEKLY TOTAL</div>
      <div className="report-hero-value">{formatDuration(total)}<span> / {formatDuration(target)}</span></div>
      <div className="progress-track"><div className="progress-fill" style={{ width: `${percent}%` }} /></div>
      <div className="progress-caption"><span>{percent}% of your target</span><span>{total >= target ? "Target reached" : `${formatDuration(target - total)} to go`}</span></div>
    </section>
    <section className="panel daily-breakdown">
      <div className="panel-heading"><div><div className="eyebrow">DAILY BREAKDOWN</div><h2>Net working time</h2></div><span className="muted">Times shown in {profile.time_zone}</span></div>
      <div className="day-rows">
        {Array.from({ length: 7 }, (_, index) => {
          const key = addLocalDays(weekStartKey, index);
          const dayBounds = localDayBounds(key, profile.time_zone);
          const start = dayBounds.start;
          const end = dayBounds.end;
          const dayTotal = summarizeWorkingTime(sessions, start, end, now);
          return <div className="day-row" key={key}>
            <div className="day-name"><strong>{new Intl.DateTimeFormat("en", { weekday: "short", timeZone: profile.time_zone }).format(new Date(start))}</strong><span>{key}</span></div>
            <div className="day-track"><div className="day-fill" style={{ width: `${Math.min(100, dayTotal / target * 100 * 7)}%` }} /></div>
            <strong className="day-value">{formatDuration(dayTotal)}</strong>
          </div>;
        })}
      </div>
      <p className="report-footnote">Sessions and breaks crossing local midnight or the week boundary are split at the correct timezone boundary.</p>
    </section>
  </div>;
}
