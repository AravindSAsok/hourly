import Link from "next/link";
import { AlertCircle } from "lucide-react";
import { ActionButton } from "@/components/action-button";
import { updatePasswordAction } from "@/app/actions";

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const query = await searchParams;
  return <main className="auth-page"><section className="auth-card">
    <Link className="brand" href="/"><span className="brand-mark">h</span><span>hourly</span></Link>
    <p className="eyebrow">ACCOUNT RECOVERY</p><h1>Choose a new password</h1><p>Set a password with at least 8 characters.</p>
    {query.error && <div className="notice notice-error auth-message" role="alert"><AlertCircle size={16} />{query.error}</div>}
    <form className="auth-form" action={updatePasswordAction}>
      <label>New password<input name="password" type="password" autoComplete="new-password" required minLength={8} /></label>
      <ActionButton label="Save password" pendingLabel="Saving…" className="button button-primary full-width" />
    </form>
    <p className="auth-secondary"><Link href="/login">Back to sign in</Link></p>
  </section></main>;
}
