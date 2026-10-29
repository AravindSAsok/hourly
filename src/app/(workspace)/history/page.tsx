import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertCircle, ArrowLeft, ArrowRight, CalendarDays, Clock3, PencilLine } from "lucide-react";
import { BreakEditForm } from "@/components/break-edit-form";
import { getHistoryPage, getProfileAndUser } from "@/lib/data";
import { calculateSessionTime, dateKeyForInput, formatDateTimeInput, formatDuration } from "@/lib/time";

function formatTime(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit", timeZone }).format(new Date(value));
}

function formatStamp(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone }).format(new Date(value));
}

export default async function HistoryPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string; page?: string }> }) {
  const query = await searchParams;
  const parsedPage = Number(query.page ?? 1);
  const page = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const [{ profile }, history] = await Promise.all([getProfileAndUser(), getHistoryPage(page)]);
  const { sessions, count } = history;
  const pageCount = Math.max(1, Math.ceil(count / 40));
  if (page > pageCount) redirect(`/history?page=${pageCount}`);
  const now = Date.now();
  return <div className="page-stack">
    <div className="page-heading"><div><div className="eyebrow">YOUR RECORD</div><h1>Work history</h1><p>Recent sessions, original punches, and recorded breaks.</p></div></div>
    {query.error && <div className="notice notice-error" role="alert"><AlertCircle size={17} />{query.error}</div>}
    {query.saved && <div className="notice notice-success">Break updated. Session and report totals have been recalculated from its timestamps.</div>}
    {sessions.length === 0 ? <section className="empty-state"><CalendarDays size={27} /><h2>Your history starts with your first punch</h2><p>Completed sessions will show up here, along with each break’s actual timestamps.</p><Link href="/dashboard" className="button button-primary">Go to dashboard</Link></section> :
      <section className="history-list" aria-label="Work sessions">
        {sessions.map((session) => {
          const result = calculateSessionTime(session, now);
          const dayKey = dateKeyForInput(session.clock_in_at, profile.time_zone);
          return <article key={session.id} className="history-card">
            <div className="history-heading">
              <div className="history-date"><span className="date-icon"><CalendarDays size={17} /></span><div><strong>{new Intl.DateTimeFormat("en", { dateStyle: "full", timeZone: profile.time_zone }).format(new Date(session.clock_in_at))}</strong><span>{dayKey}</span></div></div>
              <span className={`session-badge ${session.clock_out_at ? "badge-complete" : session.status === "on_break" ? "badge-break" : "badge-active"}`}>{session.clock_out_at ? "Completed" : session.status === "on_break" ? "On break" : "In progress"}</span>
            </div>
            <div className="history-metrics">
              <div><span>Clock in</span><strong>{formatTime(session.clock_in_at, profile.time_zone)}</strong></div>
              <div><span>Clock out</span><strong>{session.clock_out_at ? formatTime(session.clock_out_at, profile.time_zone) : "—"}</strong></div>
              <div><span>Net work</span><strong>{formatDuration(result.netWorkMs)}</strong></div>
              <div><span>Deducted breaks</span><strong>{formatDuration(result.deductedBreakMs)}</strong></div>
            </div>
            {session.breaks.length > 0 && <div className="break-list"><div className="break-list-title"><Clock3 size={15} /> BREAK RECORDS</div>
              {session.breaks.map((item) => {
                const duration = Math.max(0, (item.break_end_at ? new Date(item.break_end_at).getTime() : now) - new Date(item.break_start_at).getTime());
                const qualifies = duration >= 15 * 60_000;
                return <div key={item.id} className="break-record">
                  <div className="break-record-summary"><strong>{formatTime(item.break_start_at, profile.time_zone)} – {item.break_end_at ? formatTime(item.break_end_at, profile.time_zone) : "In progress"}</strong><span>{formatDuration(duration, true)} · {item.break_end_at ? (qualifies ? "deducted in full" : "paid working time") : (qualifies ? "provisionally deducted" : "paid time until 15 minutes")}</span></div>
                  {!!item.edits?.length && <div className="break-audit">{item.edits.map((edit, index) => <small key={`${edit.edited_at}-${index}`}>Correction {index + 1}: {formatStamp(edit.previous_break_start_at, profile.time_zone)} – {formatStamp(edit.previous_break_end_at, profile.time_zone)} changed to {formatStamp(edit.new_break_start_at, profile.time_zone)} – {formatStamp(edit.new_break_end_at, profile.time_zone)}</small>)}</div>}
                  {item.break_end_at && session.clock_out_at && item.id && <details className="edit-break"><summary><PencilLine size={14} /> Edit break times</summary><BreakEditForm breakId={item.id} startLocal={formatDateTimeInput(item.break_start_at, profile.time_zone)} endLocal={formatDateTimeInput(item.break_end_at, profile.time_zone)} />
                    <small>Each correction keeps the prior timestamps in the audit trail. The break is reclassified from its edited duration.</small></details>}
                </div>;
              })}
            </div>}
            {session.manually_edited && <div className="edited-label">Includes a manual break correction</div>}
          </article>;
        })}
      </section>}
    {count > 40 && <nav className="pagination" aria-label="History pages">
      {page > 1 ? <Link className="button button-secondary button-small" href={`/history?page=${page - 1}`}><ArrowLeft size={14} /> Previous</Link> : <span />}
      <span>Page {page} of {pageCount} · {count} sessions</span>
      {page < pageCount ? <Link className="button button-secondary button-small" href={`/history?page=${page + 1}`}>Next <ArrowRight size={14} /></Link> : <span />}
    </nav>}
  </div>;
}
