export const BREAK_DEDUCTION_THRESHOLD_MS = 15 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export type BreakRecord = {
  id?: string;
  break_start_at: string;
  break_end_at: string | null;
  edits?: BreakEditRecord[];
};

export type BreakEditRecord = {
  previous_break_start_at: string;
  previous_break_end_at: string;
  new_break_start_at: string;
  new_break_end_at: string;
  edited_at: string;
};

export type WorkSession = {
  id?: string;
  clock_in_at: string;
  clock_out_at: string | null;
  breaks: BreakRecord[];
};

export type WorkInterval = { start: number; end: number };

export type SessionTime = {
  grossMs: number;
  observedBreakMs: number;
  deductedBreakMs: number;
  netWorkMs: number;
  isOnBreak: boolean;
};

export function epoch(value: string | number | Date): number {
  const parsed = value instanceof Date ? value.getTime() : typeof value === "number" ? value : Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`Invalid timestamp: ${String(value)}`);
  return parsed;
}

function mergeIntervals(intervals: WorkInterval[]): WorkInterval[] {
  const sorted = intervals.filter((item) => item.end > item.start).sort((a, b) => a.start - b.start);
  const merged: WorkInterval[] = [];
  for (const next of sorted) {
    const previous = merged.at(-1);
    if (!previous || next.start > previous.end) merged.push({ ...next });
    else previous.end = Math.max(previous.end, next.end);
  }
  return merged;
}

function effectiveBreakInterval(
  item: BreakRecord,
  sessionStart: number,
  sessionEnd: number,
  now: number,
): { interval: WorkInterval; qualifies: boolean; inProgress: boolean } | null {
  const actualStart = epoch(item.break_start_at);
  const inProgress = item.break_end_at === null;
  const actualEnd = item.break_end_at === null ? now : epoch(item.break_end_at);
  if (actualEnd < actualStart) return null;
  const duration = actualEnd - actualStart;
  return {
    interval: {
      start: Math.max(actualStart, sessionStart),
      end: Math.min(actualEnd, sessionEnd),
    },
    qualifies: duration >= BREAK_DEDUCTION_THRESHOLD_MS,
    inProgress,
  };
}

/** Returns only qualifying break intervals. Open breaks are provisional and use `now`. */
export function deductibleBreakIntervals(session: WorkSession, now = Date.now()): WorkInterval[] {
  const start = epoch(session.clock_in_at);
  const end = Math.max(start, session.clock_out_at === null ? now : epoch(session.clock_out_at));
  const intervals = session.breaks.flatMap((item) => {
    const result = effectiveBreakInterval(item, start, end, now);
    return result?.qualifies ? [result.interval] : [];
  });
  return mergeIntervals(intervals);
}

/** Splits a session into net-working intervals, retaining original timestamps on records. */
export function workingIntervals(session: WorkSession, now = Date.now()): WorkInterval[] {
  const start = epoch(session.clock_in_at);
  const end = Math.max(start, session.clock_out_at === null ? now : epoch(session.clock_out_at));
  if (end <= start) return [];

  const breaks = deductibleBreakIntervals(session, now);
  const intervals: WorkInterval[] = [];
  let cursor = start;
  for (const pause of breaks) {
    if (pause.start > cursor) intervals.push({ start: cursor, end: pause.start });
    cursor = Math.max(cursor, pause.end);
  }
  if (cursor < end) intervals.push({ start: cursor, end });
  return intervals;
}

export function calculateSessionTime(session: WorkSession, now = Date.now()): SessionTime {
  const start = epoch(session.clock_in_at);
  const end = Math.max(start, session.clock_out_at === null ? now : epoch(session.clock_out_at));
  const grossMs = end - start;
  const observedBreakMs = session.breaks.reduce((sum, item) => {
    const breakStart = epoch(item.break_start_at);
    const breakEnd = item.break_end_at === null ? now : epoch(item.break_end_at);
    return sum + Math.max(0, Math.min(breakEnd, end) - Math.max(breakStart, start));
  }, 0);
  const netWorkMs = workingIntervals(session, now).reduce((sum, interval) => sum + interval.end - interval.start, 0);
  return {
    grossMs,
    observedBreakMs,
    deductedBreakMs: grossMs - netWorkMs,
    netWorkMs,
    isOnBreak: session.clock_out_at === null && session.breaks.some((item) => item.break_end_at === null),
  };
}

function dateParts(value: number, timeZone: string): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const part = (type: string) => Number(parts.find((item) => item.type === type)?.value);
  return { year: part("year"), month: part("month"), day: part("day") };
}

export function localDateKey(value: number | string | Date, timeZone: string): string {
  const { year, month, day } = dateParts(epoch(value), timeZone);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function dateKeyParts(key: string): { year: number; month: number; day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) throw new Error(`Invalid local date: ${key}`);
  const parts = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
  const normalized = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  if (normalized.getUTCFullYear() !== parts.year || normalized.getUTCMonth() + 1 !== parts.month || normalized.getUTCDate() !== parts.day) {
    throw new Error(`Invalid local date: ${key}`);
  }
  return parts;
}

export function addLocalDays(key: string, count: number): string {
  const { year, month, day } = dateKeyParts(key);
  const value = new Date(Date.UTC(year, month - 1, day + count));
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}-${String(value.getUTCDate()).padStart(2, "0")}`;
}

function localDateTimeToEpochParts(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone: string,
): number {
  const desiredWallTime = Date.UTC(year, month - 1, day, hour, minute, second);
  let guess = desiredWallTime;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const parts = Object.fromEntries(formatter.formatToParts(guess).map((item) => [item.type, item.value]));
    const representedWallTime = Date.UTC(
      Number(parts.year), Number(parts.month) - 1, Number(parts.day),
      Number(parts.hour), Number(parts.minute), Number(parts.second),
    );
    const correction = representedWallTime - guess - (desiredWallTime - guess);
    guess -= correction;
    if (correction === 0) break;
  }
  return guess;
}

/** Converts a local calendar date and time in an IANA zone to an epoch timestamp. */
export function localDateTimeToEpoch(value: string, timeZone: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  if (!match) throw new Error("Enter a valid local date and time.");
  const [, year, month, day, hour, minute, second = "0"] = match;
  const epochMs = localDateTimeToEpochParts(+year, +month, +day, +hour, +minute, +second, timeZone);
  const localParts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(epochMs).map((item) => [item.type, item.value]));
  const actual = `${localParts.year}-${localParts.month}-${localParts.day}T${localParts.hour}:${localParts.minute}:${localParts.second}`;
  const requested = `${year}-${month}-${day}T${hour}:${minute}:${second.padStart(2, "0")}`;
  if (actual !== requested) {
    throw new Error("That local time does not exist in the selected timezone.");
  }
  return epochMs;
}

function firstInstantOfLocalDate(key: string, timeZone: string): number {
  const { year, month, day } = dateKeyParts(key);
  let guess = localDateTimeToEpochParts(year, month, day, 0, 0, 0, timeZone);
  // A timezone may move clocks at midnight. Find the first instant whose local date is this day.
  let low = guess - 36 * 60 * 60 * 1000;
  let high = guess + 36 * 60 * 60 * 1000;
  while (localDateKey(low, timeZone) >= key) low -= 12 * 60 * 60 * 1000;
  while (localDateKey(high, timeZone) < key) high += 12 * 60 * 60 * 1000;
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if (localDateKey(middle, timeZone) >= key) high = middle;
    else low = middle;
  }
  guess = high;
  return guess;
}

export function startOfWeekDateKey(dateKey: string, weekStartsOn: number): string {
  if (!Number.isInteger(weekStartsOn) || weekStartsOn < 0 || weekStartsOn > 6) {
    throw new Error("Week start must be between Sunday (0) and Saturday (6).");
  }
  const { year, month, day } = dateKeyParts(dateKey);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return addLocalDays(dateKey, -((weekday - weekStartsOn + 7) % 7));
}

export function weekBounds(dateKey: string, weekStartsOn: number, timeZone: string): WorkInterval {
  const startKey = startOfWeekDateKey(dateKey, weekStartsOn);
  const endKey = addLocalDays(startKey, 7);
  return { start: firstInstantOfLocalDate(startKey, timeZone), end: firstInstantOfLocalDate(endKey, timeZone) };
}

export function localDayBounds(dateKey: string, timeZone: string): WorkInterval {
  return {
    start: firstInstantOfLocalDate(dateKey, timeZone),
    end: firstInstantOfLocalDate(addLocalDays(dateKey, 1), timeZone),
  };
}

export function summarizeWorkingTime(
  sessions: WorkSession[],
  start: number,
  end: number,
  now = Date.now(),
): number {
  return sessions.reduce((total, session) => {
    for (const interval of workingIntervals(session, now)) {
      total += Math.max(0, Math.min(end, interval.end) - Math.max(start, interval.start));
    }
    return total;
  }, 0);
}

/** Returns the actual elapsed time covered by breaks, including an active break provisionally. */
export function summarizeObservedBreakTime(
  sessions: WorkSession[],
  start: number,
  end: number,
  now = Date.now(),
): number {
  return sessions.reduce((total, session) => total + session.breaks.reduce((sessionTotal, item) => {
    const breakStart = epoch(item.break_start_at);
    const breakEnd = item.break_end_at === null ? now : epoch(item.break_end_at);
    return sessionTotal + Math.max(0, Math.min(end, breakEnd) - Math.max(start, breakStart));
  }, 0), 0);
}

export function dailyWorkingTotals(
  sessions: WorkSession[],
  timeZone: string,
  now = Date.now(),
): Map<string, number> {
  const totals = new Map<string, number>();
  for (const session of sessions) {
    for (const interval of workingIntervals(session, now)) {
      let cursor = interval.start;
      while (cursor < interval.end) {
        const key = localDateKey(cursor, timeZone);
        const nextStart = firstInstantOfLocalDate(addLocalDays(key, 1), timeZone);
        const segmentEnd = Math.min(interval.end, Math.max(cursor + 1, nextStart));
        totals.set(key, (totals.get(key) ?? 0) + segmentEnd - cursor);
        cursor = segmentEnd;
      }
    }
  }
  return totals;
}

export function formatDuration(milliseconds: number, seconds = false): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainder = totalSeconds % 60;
  return seconds
    ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
    : `${hours}h ${String(minutes).padStart(2, "0")}m`;
}

export function formatDateTimeInput(value: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(epoch(value));
  const part = (name: string) => parts.find((item) => item.type === name)?.value ?? "00";
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}

export function dateKeyForInput(value: string | number | Date, timeZone: string): string {
  return localDateKey(value, timeZone);
}

export const CALENDAR_DAY_MS = DAY_MS;
