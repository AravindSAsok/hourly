import { editPunchInAction } from "@/app/actions";
import { ActionButton } from "@/components/action-button";

export function PunchInEditForm({ sessionId, clockInLocal }: {
  sessionId: string;
  clockInLocal: string;
}) {
  return <form className="punch-in-edit-form" action={editPunchInAction}>
    <input type="hidden" name="session_id" value={sessionId} />
    <label>Punch in<input type="datetime-local" name="clock_in_local" defaultValue={clockInLocal} required /></label>
    <ActionButton label="Save correction" pendingLabel="Saving…" className="button button-secondary button-small" />
  </form>;
}
