import assert from "node:assert/strict";
import test from "node:test";
import { calculateSessionTime, type WorkSession } from "../src/lib/time.ts";

const DAY = "2026-02-02";
const CLOCK_IN_ORIGINAL = `${DAY}T08:19:00.000Z`;
const CLOCK_IN_CORRECTED = `${DAY}T08:00:00.000Z`;
const CLOCK_OUT = `${DAY}T17:00:00.000Z`;
const NOW = new Date(`${DAY}T20:00:00.000Z`).getTime();

function completedSession(clockInAt: string, breaks: WorkSession["breaks"] = []): WorkSession {
  return { clock_in_at: clockInAt, clock_out_at: CLOCK_OUT, breaks };
}

test("correcting a completed session's punch-in updates net working time", () => {
  const original = calculateSessionTime(completedSession(CLOCK_IN_ORIGINAL), NOW);
  const corrected = calculateSessionTime(completedSession(CLOCK_IN_CORRECTED), NOW);

  // Moving punch-in 19 minutes earlier adds exactly 19 minutes of net work.
  assert.equal(original.netWorkMs, 31_260_000);
  assert.equal(corrected.netWorkMs, 32_400_000);
  assert.equal(corrected.netWorkMs - original.netWorkMs, 19 * 60_000);
});

test("punch-in correction preserves the recorded punch-out timestamp", () => {
  const session = completedSession(CLOCK_IN_CORRECTED);
  calculateSessionTime(session, NOW);
  assert.equal(session.clock_in_at, CLOCK_IN_CORRECTED);
  assert.equal(session.clock_out_at, CLOCK_OUT);
});

test("punch-in correction does not change the 15-minute break deduction rule", () => {
  const breaks: WorkSession["breaks"] = [
    { id: "short", break_start_at: `${DAY}T12:00:00.000Z`, break_end_at: `${DAY}T12:10:00.000Z` },
    { id: "long", break_start_at: `${DAY}T13:00:00.000Z`, break_end_at: `${DAY}T13:20:00.000Z` },
  ];
  const original = calculateSessionTime(completedSession(CLOCK_IN_ORIGINAL, breaks), NOW);
  const corrected = calculateSessionTime(completedSession(CLOCK_IN_CORRECTED, breaks), NOW);

  assert.equal(original.deductedBreakMs, 20 * 60_000);
  assert.equal(corrected.deductedBreakMs, 20 * 60_000);
  assert.equal(corrected.netWorkMs - original.netWorkMs, 19 * 60_000);
});

test("moving punch-in later reduces net working time by the exact adjustment", () => {
  const later = calculateSessionTime(completedSession(`${DAY}T08:29:00.000Z`), NOW);
  const original = calculateSessionTime(completedSession(CLOCK_IN_ORIGINAL), NOW);
  assert.equal(original.netWorkMs - later.netWorkMs, 10 * 60_000);
});
