import assert from "node:assert/strict";
import test from "node:test";
import { calculateSessionTime, type WorkSession } from "../src/lib/time.ts";

const DAY = "2026-02-02";
const CLOCK_IN = `${DAY}T08:19:00.000Z`;
const BREAK_START = `${DAY}T12:00:00.000Z`;
const BREAK_END_ORIGINAL = `${DAY}T12:10:00.000Z`;
const BREAK_END_CORRECTED = `${DAY}T12:20:00.000Z`;
const NOW = new Date(`${DAY}T14:00:00.000Z`).getTime();
const GROSS_MS = NOW - Date.parse(CLOCK_IN);

function activeSessionWithCompletedBreak(breakEndAt: string | null): WorkSession {
  return {
    clock_in_at: CLOCK_IN,
    clock_out_at: null,
    breaks: [{ id: "break-1", break_start_at: BREAK_START, break_end_at: breakEndAt }],
  };
}

test("correcting a completed break in an active session recalculates work time", () => {
  const corrected = { ...activeSessionWithCompletedBreak(BREAK_END_CORRECTED) };
  assert.equal(corrected.clock_in_at, CLOCK_IN);
  assert.equal(corrected.clock_out_at, null);

  const result = calculateSessionTime(corrected, NOW);
  assert.equal(result.isOnBreak, false);
  assert.equal(result.observedBreakMs, 20 * 60_000);
  assert.equal(result.deductedBreakMs, 20 * 60_000);
  assert.equal(result.netWorkMs, GROSS_MS - 20 * 60_000);
});

test("original punch-in timestamp is not altered by completed break correction", () => {
  const session = activeSessionWithCompletedBreak(null);
  calculateSessionTime(session, NOW);
  assert.equal(session.clock_in_at, CLOCK_IN);
  assert.equal(session.clock_out_at, null);
});

test("session remains active (no clock-out) after completed break is corrected", () => {
  const session = activeSessionWithCompletedBreak(BREAK_END_CORRECTED);
  assert.equal(session.clock_out_at, null);
  const result = calculateSessionTime(session, NOW);
  assert.equal(result.isOnBreak, false);
});

test("completed break below 15 minutes in active session remains paid (deduction zero)", () => {
  for (const end of [`${DAY}T12:10:00.000Z`, `${DAY}T12:14:00.000Z`]) {
    const result = calculateSessionTime(activeSessionWithCompletedBreak(end), NOW);
    assert.equal(result.isOnBreak, false);
    assert.equal(result.deductedBreakMs, 0);
    assert.equal(result.netWorkMs, GROSS_MS);
  }
});

test("completed break at exactly 15 minutes in active session is fully deducted", () => {
  const result = calculateSessionTime(activeSessionWithCompletedBreak(`${DAY}T12:15:00.000Z`), NOW);
  assert.equal(result.deductedBreakMs, 15 * 60_000);
  assert.equal(result.netWorkMs, GROSS_MS - 15 * 60_000);
});

test("completed break above 15 minutes in active session deducts full duration", () => {
  const result = calculateSessionTime(activeSessionWithCompletedBreak(`${DAY}T13:00:00.000Z`), NOW);
  assert.equal(result.deductedBreakMs, 60 * 60_000);
  assert.equal(result.netWorkMs, GROSS_MS - 60 * 60_000);
});

test("completed break in active session plus one paid break deducts only qualifying break", () => {
  const session: WorkSession = {
    clock_in_at: CLOCK_IN,
    clock_out_at: null,
    breaks: [
      { id: "break-1", break_start_at: `${DAY}T10:00:00.000Z`, break_end_at: `${DAY}T10:10:00.000Z` },
      { id: "break-2", break_start_at: BREAK_START, break_end_at: BREAK_END_CORRECTED },
    ],
  };
  const result = calculateSessionTime(session, NOW);
  assert.equal(result.isOnBreak, false);
  assert.equal(result.deductedBreakMs, 20 * 60_000);
  assert.equal(result.netWorkMs, GROSS_MS - 20 * 60_000);
});
