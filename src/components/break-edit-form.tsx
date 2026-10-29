import { editBreakAction } from "@/app/actions";
import { ActionButton } from "@/components/action-button";

export function BreakEditForm({ breakId, startLocal, endLocal }: {
  breakId: string;
  startLocal: string;
  endLocal: string;
}) {
  return <form className="break-edit-form" action={editBreakAction}>
    <input type="hidden" name="break_id" value={breakId} />
    <label>Break started<input type="datetime-local" name="start_local" defaultValue={startLocal} required /></label>
    <label>Break ended<input type="datetime-local" name="end_local" defaultValue={endLocal} required /></label>
    <ActionButton label="Save correction" pendingLabel="Saving…" className="button button-secondary button-small" />
  </form>;
}
