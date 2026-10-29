import assert from "node:assert/strict";
import test from "node:test";
import { calculateSessionTime, type WorkSession } from "../src/lib/time.ts";

const start = Date.parse("2026-01-05T09:00:00.000Z");

function sessionWithBreak(durationMs: number): WorkSession {
  return {
    clock_in_at: new Date(start).toISOString(),
    clock_out_at: new Date(start + 60 * 60 * 60 * 1000).toISOString(),
    breaks: [{
      break_start_at: new Date(start + 60 * 60 * 1000).toISOString(),
      break_end_at: new Date(start + 60 * 60 * 1000 + durationMs).toISOString(),
    }],
  };
}

test("a 14 minute 59 second break remains paid working time", () => {
  const result = calculateSessionTime(sessionWithBreak(14 * 60 * 1000 + 59 * 1000));
  assert.equal(result.observedBreakMs, 899_000);
  assert.equal(result.deductedBreakMs, 0);
  assert.equal(result.netWorkMs, 60 * 60 * 60 * 1000);
});

test("a break of exactly 15 minutes is fully deducted", () => {
  const result = calculateSessionTime(sessionWithBreak(15 * 60 * 1000));
  assert.equal(result.deductedBreakMs, 900_000);
  assert.equal(result.netWorkMs, 60 * 60 * 60 * 1000 - 900_000);
});

test("a 15 minute 1 second break is fully deducted", () => {
  const result = calculateSessionTime(sessionWithBreak(15 * 60 * 1000 + 1000));
  assert.equal(result.deductedBreakMs, 901_000);
  assert.equal(result.netWorkMs, 60 * 60 * 60 * 1000 - 901_000);
});

test("an active break becomes provisionally deductible at 15 minutes and keeps its start", () => {
  const openedAt = start + 60 * 60 * 1000;
  const active: WorkSession = {
    clock_in_at: new Date(start).toISOString(),
    clock_out_at: null,
    breaks: [{ break_start_at: new Date(openedAt).toISOString(), break_end_at: null }],
  };
  assert.equal(calculateSessionTime(active, openedAt + 14 * 60 * 1000 + 59_000).deductedBreakMs, 0);
  assert.equal(calculateSessionTime(active, openedAt + 15 * 60 * 1000).deductedBreakMs, 900_000);
  assert.equal(active.breaks[0].break_start_at, new Date(openedAt).toISOString());
  assert.equal(active.breaks[0].break_end_at, null);
});
