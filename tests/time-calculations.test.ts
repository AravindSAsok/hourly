import assert from "node:assert/strict";
import test from "node:test";
import { calculateSessionTime, dailyWorkingTotals, localDateTimeToEpoch, localDayBounds, summarizeWorkingTime, weekBounds, type WorkSession } from "../src/lib/time.ts";

test("multiple breaks exclude only completed intervals of at least 15 minutes", () => {
  const session: WorkSession = {
    clock_in_at: "2026-02-02T08:00:00.000Z",
    clock_out_at: "2026-02-02T17:00:00.000Z",
    breaks: [
      { break_start_at: "2026-02-02T10:00:00.000Z", break_end_at: "2026-02-02T10:10:00.000Z" },
      { break_start_at: "2026-02-02T12:00:00.000Z", break_end_at: "2026-02-02T12:30:00.000Z" },
      { break_start_at: "2026-02-02T15:00:00.000Z", break_end_at: "2026-02-02T15:15:01.000Z" },
    ],
  };
  const result = calculateSessionTime(session);
  assert.equal(result.observedBreakMs, 55 * 60_000 + 1_000);
  assert.equal(result.deductedBreakMs, 45 * 60_000 + 1_000);
  assert.equal(result.netWorkMs, 8 * 60 * 60_000 + 14 * 60_000 + 59_000);
});

test("working time is allocated to local dates when a session crosses midnight", () => {
  const session: WorkSession = {
    clock_in_at: "2026-10-28T22:00:00.000Z",
    clock_out_at: "2026-10-29T02:00:00.000Z",
    breaks: [{ break_start_at: "2026-10-28T23:50:00.000Z", break_end_at: "2026-10-29T00:10:00.000Z" }],
  };
  const totals = dailyWorkingTotals([session], "UTC");
  assert.equal(totals.get("2026-10-28"), 110 * 60_000);
  assert.equal(totals.get("2026-10-29"), 110 * 60_000);
});

test("weekly totals split sessions at a local week boundary", () => {
  const session: WorkSession = {
    clock_in_at: "2026-10-25T23:00:00.000Z",
    clock_out_at: "2026-10-26T03:00:00.000Z",
    breaks: [],
  };
  const previousWeek = weekBounds("2026-10-25", 1, "UTC");
  const mondayWeek = weekBounds("2026-10-26", 1, "UTC");
  assert.equal(summarizeWorkingTime([session], previousWeek.start, previousWeek.end), 60 * 60_000);
  assert.equal(summarizeWorkingTime([session], mondayWeek.start, mondayWeek.end), 3 * 60 * 60_000);
});

test("local day and week boundaries respect daylight saving changes", () => {
  const day = localDayBounds("2026-03-08", "America/New_York");
  assert.equal(day.end - day.start, 23 * 60 * 60_000);
  const week = weekBounds("2026-03-08", 0, "America/New_York");
  assert.equal(week.end - week.start, 7 * 24 * 60 * 60_000 - 60 * 60_000);
});

test("manual local timestamps reject a nonexistent daylight-saving time", () => {
  assert.throws(() => localDateTimeToEpoch("2026-03-08T02:30", "America/New_York"), /does not exist/);
});
