"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { CalendarDays, PencilLine, Trash2, X } from "lucide-react";
import { deleteWorkDayAction } from "@/app/actions";

export function HistoryDayCard({
  dayKey,
  dayLabel,
  sessionCount,
  breakCount,
  netWork,
  deductedBreaks,
  hasActiveSession,
  children,
}: {
  dayKey: string;
  dayLabel: string;
  sessionCount: number;
  breakCount: number;
  netWork: string;
  deductedBreaks: string;
  hasActiveSession: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"choose" | "edit" | "delete">("choose");
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  function showDialog() {
    setMode("choose");
    setOpen(true);
  }

  return <>
    <button type="button" className="history-day-trigger" onClick={showDialog} aria-haspopup="dialog">
      <span className="date-icon"><CalendarDays size={18} /></span>
      <span className="history-day-title"><strong>{dayLabel}</strong><small>{sessionCount} {sessionCount === 1 ? "session" : "sessions"} · {breakCount} {breakCount === 1 ? "break" : "breaks"}</small></span>
      <span className="history-day-stats"><strong>{netWork}</strong><small>Net work</small></span>
      <span className="history-day-stats"><strong>{deductedBreaks}</strong><small>Breaks deducted</small></span>
      <span className="history-day-open">View day</span>
    </button>
    {open && <div className="history-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section ref={dialogRef} className="history-modal" role="dialog" aria-modal="true" aria-labelledby="history-modal-title">
        <div className="history-modal-header">
          <div><div className="eyebrow">DAY DETAILS</div><h2 id="history-modal-title">{dayLabel}</h2></div>
          <button type="button" className="icon-button" onClick={() => setOpen(false)} aria-label="Close day details"><X size={18} /></button>
        </div>
        {mode === "choose" && <>
          <p className="history-modal-copy">This day contains {sessionCount} {sessionCount === 1 ? "work session" : "work sessions"} and {breakCount} {breakCount === 1 ? "break" : "breaks"}. What would you like to do?</p>
          <div className="history-modal-actions">
            <button type="button" className="button button-secondary" onClick={() => setMode("edit")}><PencilLine size={15} /> Edit day</button>
            <button type="button" className="button button-danger-outline" onClick={() => setMode("delete")}><Trash2 size={15} /> Delete day</button>
          </div>
        </>}
        {mode === "edit" && <>
          <div className="history-modal-subheading"><strong>Edit this day</strong><button type="button" className="text-button" onClick={() => setMode("choose")}>Back</button></div>
          <p className="history-modal-copy">Edit the punch-out times and break times for each session below. All changes are saved to your correction history.</p>
          <div className="history-modal-content">{children}</div>
        </>}
        {mode === "delete" && <>
          <div className="history-delete-warning"><strong>Delete this entire day?</strong><p>This permanently removes all {sessionCount} work {sessionCount === 1 ? "session" : "sessions"}, their breaks, and their correction history. This cannot be undone.</p></div>
          {hasActiveSession ? <div className="notice notice-error">This day contains an active work session. Punch out first before deleting the day.</div> : <form action={deleteWorkDayAction} className="history-delete-form">
            <input type="hidden" name="day_key" value={dayKey} />
            <button type="button" className="button button-secondary" onClick={() => setMode("choose")}>Cancel</button>
            <button type="submit" className="button button-danger-outline"><Trash2 size={15} /> Delete all day records</button>
          </form>}
        </>}
      </section>
    </div>}
  </>;
}
