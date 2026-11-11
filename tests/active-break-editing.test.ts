import assert from "node:assert/strict";
import test from "node:test";
import { calculateSessionTime, type WorkSession } from "../src/lib/time.ts";

const DAY = "2026-02-02";
const CLOCK_IN = `${DAY}T08:19:00.000Z`;
const BREAK_START = `${DAY}T12:00:00.000Z`;
const NOW = new Date(`${DAY}T14:00:00.000Z`).getTime();
const GROSS_MS = NOW - Date.parse(CLOCK_IN);

function activeSession(breakEndAt: string | null): WorkSession {
  return {
    clock_in_at: CLOCK_IN,
    clock_out_at: null,
    breaks: [{ id: "break-1", break_start_at: BREAK_START, break_end_at: breakEndAt }],
  };
}

test("an active break is treated as in-progress and provisionally deducted", () => {
  const result = calculateSessionTime(activeSession(null), NOW);
  assert.equal(result.isOnBreak, true);
  assert.equal(result.observedBreakMs, 120 * 60_000);
  assert.equal(result.deductedBreakMs, 120 * 60_000);
});

test("correcting an active break's end time completes the break and returns the user to Working", () => {
  const corrected = { ...activeSession(`${DAY}T12:20:00.000Z`) };
  assert.equal(corrected.clock_in_at, CLOCK_IN);

  const result = calculateSessionTime(corrected, NOW);
  assert.equal(result.isOnBreak, false);
  assert.equal(result.observedBreakMs, 20 * 60_000);
  assert.equal(result.deductedBreakMs, 20 * 60_000);
  assert.equal(result.netWorkMs, GROSS_MS - 20 * 60_000);
});

test("corrected active break below 15 minutes remains paid (deduction zero)", () => {
  for (const end of [`${DAY}T12:10:00.000Z`, `${DAY}T12:14:00.000Z`]) {
    const result = calculateSessionTime(activeSession(end), NOW);
    assert.equal(result.isOnBreak, false);
    assert.equal(result.deductedBreakMs, 0);
    assert.equal(result.netWorkMs, GROSS_MS);
  }
});

test("corrected active break at exactly 15 minutes is fully deducted", () => {
  const result = calculateSessionTime(activeSession(`${DAY}T12:15:00.000Z`), NOW);
  assert.equal(result.deductedBreakMs, 15 * 60_000);
  assert.equal(result.netWorkMs, GROSS_MS - 15 * 60_000);
});

test("corrected active break above 15 minutes deducts the full duration", () => {
  const result = calculateSessionTime(activeSession(`${DAY}T13:00:00.000Z`), NOW);
  assert.equal(result.deductedBreakMs, 60 * 60_000);
  assert.equal(result.netWorkMs, GROSS_MS - 60 * 60_000);
});

test("original punch-in timestamp is not altered by the correction", () => {
  const session = activeSession(null);
  calculateSessionTime(session, NOW);
  assert.equal(session.clock_in_at, CLOCK_IN);
  assert.equal(session.clock_out_at, null);
});

test("session remains open (no clock-out) after an active break is corrected", () => {
  const session = activeSession(`${DAY}T12:20:00.000Z`);
  assert.equal(session.clock_out_at, null);
  const result = calculateSessionTime(session, NOW);
  assert.equal(result.isOnBreak, false);
});

test("one corrected qualifying break plus one paid break deducts only the qualifying break", () => {
  const session: WorkSession = {
    clock_in_at: CLOCK_IN,
    clock_out_at: null,
    breaks: [
      { id: "break-1", break_start_at: `${DAY}T10:00:00.000Z`, break_end_at: `${DAY}T10:10:00.000Z` },
      { id: "break-2", break_start_at: BREAK_START, break_end_at: `${DAY}T12:20:00.000Z` },
    ],
  };
  const result = calculateSessionTime(session, NOW);
  assert.equal(result.isOnBreak, false);
  assert.equal(result.deductedBreakMs, 20 * 60_000);
  assert.equal(result.netWorkMs, GROSS_MS - 20 * 60_000);
});
