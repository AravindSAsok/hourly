import { editPunchOutAction } from "@/app/actions";
import { ActionButton } from "@/components/action-button";

export function PunchOutEditForm({ sessionId, clockOutLocal }: {
  sessionId: string;
  clockOutLocal: string;
}) {
  return <form className="punch-out-edit-form" action={editPunchOutAction}>
    <input type="hidden" name="session_id" value={sessionId} />
    <label>Punch out<input type="datetime-local" name="clock_out_local" defaultValue={clockOutLocal} required /></label>
    <ActionButton label="Save correction" pendingLabel="Saving…" className="button button-secondary button-small" />
  </form>;
}
