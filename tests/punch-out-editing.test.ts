import assert from "node:assert/strict";
import test from "node:test";
import { calculateSessionTime, type WorkSession } from "../src/lib/time.ts";

const DAY = "2026-02-02";
const CLOCK_IN = `${DAY}T08:19:00.000Z`;
const PUNCH_OUT_ORIGINAL = `${DAY}T17:00:00.000Z`;
const PUNCH_OUT_CORRECTED = `${DAY}T17:30:00.000Z`;
const NOW = new Date(`${DAY}T20:00:00.000Z`).getTime();

function completedSession(clockOutAt: string | null): WorkSession {
  return {
    clock_in_at: CLOCK_IN,
    clock_out_at: clockOutAt,
    breaks: [],
  };
}

test("correcting a completed session's punch-out updates net working time", () => {
  const original = calculateSessionTime(completedSession(PUNCH_OUT_ORIGINAL), NOW);
  const corrected = calculateSessionTime(completedSession(PUNCH_OUT_CORRECTED), NOW);

  // 08:19 to 17:00 = 8h 41m; 08:19 to 17:30 = 9h 11m; difference = 30 min
  assert.equal(original.netWorkMs, 31_260_000);
  assert.equal(corrected.netWorkMs, 33_060_000);
  assert.equal(corrected.netWorkMs - original.netWorkMs, 30 * 60_000);
});

test("original punch-in timestamp is not altered by punch-out correction", () => {
  const session = completedSession(PUNCH_OUT_CORRECTED);
  calculateSessionTime(session, NOW);
  assert.equal(session.clock_in_at, CLOCK_IN);
  assert.equal(session.clock_out_at, PUNCH_OUT_CORRECTED);
});

test("completed session is not treated as on break", () => {
  const result = calculateSessionTime(completedSession(PUNCH_OUT_CORRECTED), NOW);
  assert.equal(result.isOnBreak, false);
});

test("punch-out correction does not change break deduction policy for sessions with breaks", () => {
  const session: WorkSession = {
    clock_in_at: CLOCK_IN,
    clock_out_at: PUNCH_OUT_CORRECTED,
    breaks: [
      { id: "break-1", break_start_at: `${DAY}T12:00:00.000Z`, break_end_at: `${DAY}T12:10:00.000Z` },
      { id: "break-2", break_start_at: `${DAY}T13:00:00.000Z`, break_end_at: `${DAY}T13:20:00.000Z` },
    ],
  };
  const result = calculateSessionTime(session, NOW);
  // Gross: 08:19 to 17:30 = 9h 11m = 33,060,000 ms.
  // 10-minute break: paid (0 deduction). 20-minute break: deducted in full (20 min = 1,200,000 ms).
  assert.equal(result.deductedBreakMs, 20 * 60_000);
  assert.equal(result.netWorkMs, 33_060_000 - 20 * 60_000);
});
