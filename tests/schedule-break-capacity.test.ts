import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateAdditionalWorkNeededMs,
  calculateRemainingScheduleBreakCapacity,
  calculateScheduleBreakCapacity,
  calculateSessionTime,
  localDateTimeToEpoch,
  localDayBounds,
  summarizeObservedBreakTime,
  type WorkSession,
} from "../src/lib/time.ts";

const DAILY_TARGET_MS = 8 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

function capacity(punchIn: string, leaving: string, timeZone = "UTC") {
  return calculateScheduleBreakCapacity(
    localDateTimeToEpoch(`2026-02-02T${punchIn}`, timeZone),
    localDateTimeToEpoch(`2026-02-02T${leaving}`, timeZone),
    DAILY_TARGET_MS,
  );
}

test("schedule capacity is based on punch-in, leaving time, and the 8-hour target", () => {
  assert.equal(capacity("08:00", "17:30"), 90 * MINUTE_MS);
  assert.equal(capacity("08:30", "17:30"), 60 * MINUTE_MS);
  assert.equal(capacity("09:00", "17:30"), 30 * MINUTE_MS);
  assert.equal(capacity("08:19", "17:30"), 71 * MINUTE_MS);
});

test("schedule capacity uses the selected IANA timezone", () => {
  assert.equal(capacity("08:19", "17:30", "Asia/Calcutta"), 71 * MINUTE_MS);
});

test("a completed 10-minute paid break does not reduce remaining schedule capacity", () => {
  const clockIn = localDateTimeToEpoch("2026-02-02T08:19", "UTC");
  const session: WorkSession = {
    clock_in_at: new Date(clockIn).toISOString(),
    clock_out_at: new Date(localDateTimeToEpoch("2026-02-02T17:30", "UTC")).toISOString(),
    breaks: [{
      break_start_at: new Date(localDateTimeToEpoch("2026-02-02T10:00", "UTC")).toISOString(),
      break_end_at: new Date(localDateTimeToEpoch("2026-02-02T10:10", "UTC")).toISOString(),
    }],
  };
  const bounds = localDayBounds("2026-02-02", "UTC");
  const recordedBreakMs = summarizeObservedBreakTime([session], bounds.start, bounds.end);
  const result = calculateSessionTime(session);
  const totalScheduleCapacityMs = capacity("08:19", "17:30");

  assert.equal(recordedBreakMs, 10 * MINUTE_MS);
  assert.equal(calculateRemainingScheduleBreakCapacity(totalScheduleCapacityMs, result.deductedBreakMs), 71 * MINUTE_MS);
  assert.equal(result.deductedBreakMs, 0);
  assert.equal(result.netWorkMs, 9 * 60 * MINUTE_MS + 11 * MINUTE_MS);
});

test("an active 10-minute break does not reduce remaining schedule capacity", () => {
  const clockIn = localDateTimeToEpoch("2026-02-02T08:19", "UTC");
  const breakStart = localDateTimeToEpoch("2026-02-02T10:00", "UTC");
  const now = breakStart + 10 * MINUTE_MS;
  const session: WorkSession = {
    clock_in_at: new Date(clockIn).toISOString(),
    clock_out_at: null,
    breaks: [{ break_start_at: new Date(breakStart).toISOString(), break_end_at: null }],
  };
  const bounds = localDayBounds("2026-02-02", "UTC");

  assert.equal(summarizeObservedBreakTime([session], bounds.start, bounds.end, now), 10 * MINUTE_MS);
  const deductedBreakMs = calculateSessionTime(session, now).deductedBreakMs;
  assert.equal(deductedBreakMs, 0);
  assert.equal(calculateRemainingScheduleBreakCapacity(capacity("08:19", "17:30"), deductedBreakMs), 71 * MINUTE_MS);
});

test("an active 20-minute break provisionally reduces remaining schedule capacity", () => {
  const clockIn = localDateTimeToEpoch("2026-02-02T08:19", "UTC");
  const breakStart = localDateTimeToEpoch("2026-02-02T10:00", "UTC");
  const now = breakStart + 20 * MINUTE_MS;
  const session: WorkSession = {
    clock_in_at: new Date(clockIn).toISOString(),
    clock_out_at: null,
    breaks: [{ break_start_at: new Date(breakStart).toISOString(), break_end_at: null }],
  };
  const deductedBreakMs = calculateSessionTime(session, now).deductedBreakMs;

  assert.equal(deductedBreakMs, 20 * MINUTE_MS);
  assert.equal(calculateRemainingScheduleBreakCapacity(capacity("08:19", "17:30"), deductedBreakMs), 51 * MINUTE_MS);
});

test("a paid 10-minute break plus a deducted 20-minute break reduces capacity by only 20 minutes", () => {
  const clockIn = localDateTimeToEpoch("2026-02-02T08:19", "UTC");
  const firstBreakStart = localDateTimeToEpoch("2026-02-02T10:00", "UTC");
  const secondBreakStart = localDateTimeToEpoch("2026-02-02T12:00", "UTC");
  const session: WorkSession = {
    clock_in_at: new Date(clockIn).toISOString(),
    clock_out_at: new Date(localDateTimeToEpoch("2026-02-02T17:30", "UTC")).toISOString(),
    breaks: [
      {
        break_start_at: new Date(firstBreakStart).toISOString(),
        break_end_at: new Date(firstBreakStart + 10 * MINUTE_MS).toISOString(),
      },
      {
        break_start_at: new Date(secondBreakStart).toISOString(),
        break_end_at: new Date(secondBreakStart + 20 * MINUTE_MS).toISOString(),
      },
    ],
  };
  const bounds = localDayBounds("2026-02-02", "UTC");
  const result = calculateSessionTime(session);

  assert.equal(summarizeObservedBreakTime([session], bounds.start, bounds.end), 30 * MINUTE_MS);
  assert.equal(result.deductedBreakMs, 20 * MINUTE_MS);
  assert.equal(calculateRemainingScheduleBreakCapacity(capacity("08:19", "17:30"), result.deductedBreakMs), 51 * MINUTE_MS);
});

test("changing planned leaving time changes capacity without changing break deduction", () => {
  const clockIn = localDateTimeToEpoch("2026-02-02T08:19", "UTC");
  const session: WorkSession = {
    clock_in_at: new Date(clockIn).toISOString(),
    clock_out_at: new Date(localDateTimeToEpoch("2026-02-02T17:30", "UTC")).toISOString(),
    breaks: [{
      break_start_at: new Date(localDateTimeToEpoch("2026-02-02T10:00", "UTC")).toISOString(),
      break_end_at: new Date(localDateTimeToEpoch("2026-02-02T10:20", "UTC")).toISOString(),
    }],
  };
  const before = calculateSessionTime(session);
  assert.equal(capacity("08:19", "17:30"), 71 * MINUTE_MS);
  assert.equal(capacity("08:19", "18:00"), 101 * MINUTE_MS);
  assert.deepEqual(calculateSessionTime(session), before);
  assert.equal(before.deductedBreakMs, 20 * MINUTE_MS);
});

test("edited break timestamps recalculate deducted capacity", () => {
  const clockIn = localDateTimeToEpoch("2026-02-02T08:19", "UTC");
  const breakStart = localDateTimeToEpoch("2026-02-02T10:00", "UTC");
  const session: WorkSession = {
    clock_in_at: new Date(clockIn).toISOString(),
    clock_out_at: new Date(localDateTimeToEpoch("2026-02-02T17:30", "UTC")).toISOString(),
    breaks: [{
      break_start_at: new Date(breakStart).toISOString(),
      break_end_at: new Date(breakStart + 10 * MINUTE_MS).toISOString(),
    }],
  };
  const bounds = localDayBounds("2026-02-02", "UTC");
  const beforeObserved = summarizeObservedBreakTime([session], bounds.start, bounds.end);
  const beforeDeducted = calculateSessionTime(session).deductedBreakMs;
  const totalScheduleCapacityMs = capacity("08:19", "17:30");

  session.breaks[0].break_end_at = new Date(breakStart + 20 * MINUTE_MS).toISOString();
  assert.equal(summarizeObservedBreakTime([session], bounds.start, bounds.end), 20 * MINUTE_MS);
  assert.equal(beforeObserved, 10 * MINUTE_MS);
  assert.equal(beforeDeducted, 0);
  const afterDeducted = calculateSessionTime(session).deductedBreakMs;
  assert.equal(afterDeducted, 20 * MINUTE_MS);
  assert.equal(calculateRemainingScheduleBreakCapacity(totalScheduleCapacityMs, afterDeducted), 51 * MINUTE_MS);
});

test("capacity cannot be negative and an insufficient schedule reports work needed", () => {
  assert.equal(capacity("09:00", "16:00"), 0);
  assert.equal(calculateScheduleBreakCapacity(null, 0, DAILY_TARGET_MS), 0);
  assert.equal(calculateAdditionalWorkNeededMs(8 * 60 * MINUTE_MS, 7 * 60 * MINUTE_MS), 60 * MINUTE_MS);
  assert.equal(calculateAdditionalWorkNeededMs(7 * 60 * MINUTE_MS, 8 * 60 * MINUTE_MS), 0);
});
