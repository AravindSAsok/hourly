"use client";

import { useRef, useState } from "react";
import { Coffee, Timer, TriangleAlert } from "lucide-react";
import { savePlannedLeavingTimeAction } from "@/app/actions";
import type { Profile, StoredSession } from "@/lib/data";
import {
  dateKeyForInput,
  formatDuration,
  localDateTimeToEpoch,
  localDayBounds,
  summarizeDeductibleBreakTime,
  summarizeObservedBreakTime,
  summarizeWorkingTime,
} from "@/lib/time";

const DAILY_TARGET_MS = 8 * 60 * 60 * 1000;
const DAILY_BREAK_ALLOWANCE_MS = 60 * 60 * 1000;

function timeLabel(value: number, timeZone: string) {
  return new Intl.DateTimeFormat("en", {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(new Date(value));
}

function suggestionLabel(value: number, referenceDate: string, timeZone: string) {
  if (dateKeyForInput(value, timeZone) === referenceDate) return timeLabel(value, timeZone);
  return new Intl.DateTimeFormat("en", {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(new Date(value));
}

export function SmartBreakPlanner({ profile, sessions, now }: {
  profile: Profile;
  sessions: StoredSession[];
  now: number;
}) {
  const [plannedLeavingTime, setPlannedLeavingTime] = useState(profile.planned_leaving_time || "17:30");
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const [saveMessage, setSaveMessage] = useState("");
  const saveVersion = useRef(0);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());

  const currentDate = dateKeyForInput(now, profile.time_zone);
  const today = localDayBounds(currentDate, profile.time_zone);
  const netWorkedMs = summarizeWorkingTime(sessions, today.start, today.end, now);
  const remainingWorkMs = Math.max(0, DAILY_TARGET_MS - netWorkedMs);
  const recordedBreakMs = summarizeObservedBreakTime(sessions, today.start, today.end, now);
  const deductedBreakMs = summarizeDeductibleBreakTime(sessions, today.start, today.end, now);
  const remainingBreakAllowanceMs = Math.max(0, DAILY_BREAK_ALLOWANCE_MS - deductedBreakMs);

  let plannedLeavingAt: number | null = null;
  try {
    plannedLeavingAt = localDateTimeToEpoch(`${currentDate}T${plannedLeavingTime}`, profile.time_zone);
  } catch {
    // A selected wall-clock time can be missing on the rare local date when clocks jump forward.
  }

  const timeAvailableMs = plannedLeavingAt === null ? 0 : Math.max(0, plannedLeavingAt - now);
  const additionalWorkNeededMs = Math.max(0, remainingWorkMs - timeAvailableMs);
  const canReachTarget = plannedLeavingAt !== null && additionalWorkNeededMs === 0;
  const maximumAdditionalBreakMs = Math.max(0, Math.min(
    remainingBreakAllowanceMs,
    timeAvailableMs - remainingWorkMs,
  ));

  function changePlannedLeavingTime(value: string) {
    setPlannedLeavingTime(value);
    setSaveMessage("");
    const version = ++saveVersion.current;
    if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) {
      setSaveState("error");
      setSaveMessage("Choose a valid leaving time.");
      return;
    }
    setSaveState("saving");
    saveQueue.current = saveQueue.current.then(async () => {
      try {
        const result = await savePlannedLeavingTimeAction(value);
        if (version !== saveVersion.current) return;
        setSaveState(result.ok ? "saved" : "error");
        setSaveMessage(result.ok ? "Saved" : result.message ?? "Could not save");
      } catch {
        if (version !== saveVersion.current) return;
        setSaveState("error");
        setSaveMessage("Could not save. Please try again.");
      }
    });
  }

  const suggestedLeavingAt = now + remainingWorkMs;

  return <section className="panel planner-panel" aria-labelledby="planner-heading">
    <div className="planner-heading">
      <div className="planner-title">
        <span className="planner-symbol"><Coffee size={18} /></span>
        <div><div className="eyebrow">PLAN THE REST OF YOUR DAY</div><h2 id="planner-heading">Smart Break Planner</h2></div>
      </div>
      <label className="planner-leaving-field">Planned leaving time <small>{profile.time_zone}</small>
        <input
          type="time"
          required
          value={plannedLeavingTime}
          onChange={(event) => changePlannedLeavingTime(event.target.value)}
          aria-describedby="planner-save-status"
        />
      </label>
    </div>

    <div className="planner-metrics">
      <div><span>Daily work target</span><strong>{formatDuration(DAILY_TARGET_MS, true)}</strong></div>
      <div><span>Net worked</span><strong>{formatDuration(netWorkedMs, true)}</strong></div>
      <div><span>Remaining work</span><strong>{formatDuration(remainingWorkMs, true)}</strong></div>
      <div><span>Daily break allowance</span><strong>{formatDuration(DAILY_BREAK_ALLOWANCE_MS, true)}</strong></div>
      <div><span>Total recorded break time</span><strong>{formatDuration(recordedBreakMs, true)}</strong></div>
      <div><span>Break allowance used</span><strong>{formatDuration(deductedBreakMs, true)}</strong></div>
      <div><span>Remaining break allowance</span><strong>{formatDuration(remainingBreakAllowanceMs, true)}</strong></div>
    </div>

    <div className={`planner-result ${canReachTarget ? "planner-result-ready" : "planner-result-shortfall"}`} aria-live="polite">
      <div className="planner-result-icon">{canReachTarget ? <Timer size={18} /> : <TriangleAlert size={18} />}</div>
      <div className="planner-result-copy">
        <span>Maximum additional break</span>
        <strong>{plannedLeavingAt === null ? "—" : formatDuration(maximumAdditionalBreakMs, true)}</strong>
        {plannedLeavingAt === null
          ? <p>This leaving time does not occur today in your timezone. Choose another time.</p>
          : canReachTarget
          ? <p>The 8-hour target is achievable by {timeLabel(plannedLeavingAt, profile.time_zone)}.</p>
          : <p>The 8-hour target is not reachable by {timeLabel(plannedLeavingAt, profile.time_zone)}. You need {formatDuration(additionalWorkNeededMs, true)} more working time than remains. With no additional breaks, you would reach the target around {suggestionLabel(suggestedLeavingAt, currentDate, profile.time_zone)}.</p>}
      </div>
      <div id="planner-save-status" className={`planner-save-status ${saveState === "error" ? "planner-save-error" : ""}`} role="status">
        {saveMessage || (saveState === "saving" ? "Saving…" : "Leaving time saved")}
      </div>
    </div>

    <p className="planner-footnote">Short breaks under 15 minutes are paid and do not consume the daily break allowance. Completed breaks of 15 minutes or longer deduct their full duration and use that allowance. An active break under 15 minutes does not use the allowance; once it reaches 15 minutes, its full elapsed duration provisionally counts against it until it ends. All break time remains recorded.</p>
  </section>;
}
