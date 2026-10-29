import { AlertCircle, CheckCircle2, ShieldCheck } from "lucide-react";
import { ActionButton } from "@/components/action-button";
import { getProfileAndUser } from "@/lib/data";
import { savePreferencesAction } from "@/app/actions";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  const [{ profile, user }, query] = await Promise.all([getProfileAndUser(), searchParams]);
  return <div className="page-stack">
    <div className="page-heading"><div><div className="eyebrow">MAKE HOURLY YOURS</div><h1>Settings</h1><p>Set your weekly target and the local calendar used for reports.</p></div></div>
    {query.error && <div className="notice notice-error" role="alert"><AlertCircle size={17} />{query.error}</div>}
    {query.saved && <div className="notice notice-success"><CheckCircle2 size={17} />Preferences saved.</div>}
    <form className="settings-form panel" action={savePreferencesAction}>
      <div className="settings-section-title"><div className="settings-symbol"><ShieldCheck size={19} /></div><div><h2>Work preferences</h2><p>Your timezone controls daily totals, week boundaries, history, and exports.</p></div></div>
      <label className="field-label">Display name<span className="optional">Optional</span><input name="display_name" type="text" autoComplete="name" maxLength={80} defaultValue={profile.display_name ?? ""} placeholder={user.email?.split("@")[0] ?? "Your name"} /></label>
      <label className="field-label">Weekly target <span className="field-suffix">hours</span><input name="weekly_target_hours" type="number" min="1" max="168" step="0.25" defaultValue={profile.weekly_target_minutes / 60} required /><small>Enter 1 to 168 hours. Extra work is always counted.</small></label>
      <label className="field-label">Week starts on<select name="week_starts_on" defaultValue={profile.week_starts_on}><option value="0">Sunday</option><option value="1">Monday</option><option value="2">Tuesday</option><option value="3">Wednesday</option><option value="4">Thursday</option><option value="5">Friday</option><option value="6">Saturday</option></select></label>
      <label className="field-label">Timezone<input name="time_zone" type="text" autoComplete="off" defaultValue={profile.time_zone} required aria-describedby="timezone-help" /><small id="timezone-help">Use an IANA name such as Asia/Kolkata, Europe/London, or America/Los_Angeles.</small></label>
      <div className="settings-submit"><ActionButton label="Save preferences" pendingLabel="Saving…" /></div>
      <p className="settings-account">Signed in as <strong>{user.email}</strong></p>
    </form>
    <section className="panel setting-rule"><div className="eyebrow">BREAK DEDUCTION</div><h2>15-minute threshold</h2><p>A completed break under 15 minutes counts as paid time. At 15 minutes and above, the full break duration is deducted. Original timestamps remain in your history; reports recalculate from those timestamps.</p></section>
  </div>;
}
