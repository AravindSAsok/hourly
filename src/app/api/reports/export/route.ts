import { NextRequest, NextResponse } from "next/server";
import { getProfileAndUser, getSessionsOverlapping } from "@/lib/data";
import { formatDuration, startOfWeekDateKey, summarizeWorkingTime, weekBounds } from "@/lib/time";

function csv(value: string | number) {
  const text = String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function localStamp(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).format(new Date(value));
}

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("week") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(query)) return NextResponse.json({ error: "Choose a valid reporting week." }, { status: 400 });
  const { profile } = await getProfileAndUser();
  let week: string;
  try { week = startOfWeekDateKey(query, profile.week_starts_on); }
  catch { return NextResponse.json({ error: "Choose a valid reporting week." }, { status: 400 }); }
  const bounds = weekBounds(week, profile.week_starts_on, profile.time_zone);
  const sessions = await getSessionsOverlapping(bounds.start, bounds.end);
  const now = Date.now();
  const lines = [[
    "session_id", "clock_in_at_utc", "clock_in_local", "clock_out_at_utc", "clock_out_local", "time_zone",
    "gross_time_in_week", "observed_break_time_in_week",
    "deducted_break_time_in_week", "net_work_time_in_week", "status", "manually_edited",
  ].map(csv).join(",")];
  for (const session of sessions) {
    const sessionStart = new Date(session.clock_in_at).getTime();
    const sessionEnd = session.clock_out_at ? new Date(session.clock_out_at).getTime() : now;
    const grossInWeek = Math.max(0, Math.min(bounds.end, sessionEnd) - Math.max(bounds.start, sessionStart));
    const netInWeek = summarizeWorkingTime([session], bounds.start, bounds.end, now);
    const observedInWeek = session.breaks.reduce((sum, item) => {
      const breakStart = new Date(item.break_start_at).getTime();
      const breakEnd = item.break_end_at ? new Date(item.break_end_at).getTime() : now;
      return sum + Math.max(0, Math.min(bounds.end, breakEnd) - Math.max(bounds.start, breakStart));
    }, 0);
    const deductedInWeek = grossInWeek - netInWeek;
    lines.push([
      session.id,
      new Date(session.clock_in_at).toISOString(),
      localStamp(session.clock_in_at, profile.time_zone),
      session.clock_out_at ? new Date(session.clock_out_at).toISOString() : "In progress",
      session.clock_out_at ? localStamp(session.clock_out_at, profile.time_zone) : "In progress",
      profile.time_zone,
      formatDuration(grossInWeek, true),
      formatDuration(observedInWeek, true),
      formatDuration(deductedInWeek, true),
      formatDuration(netInWeek, true),
      session.clock_out_at ? "completed" : session.status,
      session.manually_edited ? "yes" : "no",
    ].map(csv).join(","));
  }
  const filename = `hourly-week-${week}.csv`;
  return new NextResponse(`\uFEFF${lines.join("\r\n")}`, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "private, no-store",
    },
  });
}
