import Link from "next/link";
import { AlertCircle } from "lucide-react";
import { ActionButton } from "@/components/action-button";
import { forgotPasswordAction } from "@/app/actions";

export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<{ error?: string; sent?: string }> }) {
  const query = await searchParams;
  return <main className="auth-page"><section className="auth-card">
    <Link className="brand" href="/"><span className="brand-mark">h</span><span>hourly</span></Link>
    <p className="eyebrow">ACCOUNT RECOVERY</p><h1>Reset your password</h1><p>Enter your email and we’ll send a secure reset link if there’s an account for it.</p>
    {query.error && <div className="notice notice-error auth-message" role="alert"><AlertCircle size={16} />{query.error}</div>}
    {query.sent && <div className="notice notice-success auth-message">If that account exists, a reset link is on its way.</div>}
    <form className="auth-form" action={forgotPasswordAction}>
      <label>Email<input name="email" type="email" autoComplete="email" required placeholder="you@example.com" /></label>
      <ActionButton label="Send reset link" pendingLabel="Sending…" className="button button-primary full-width" />
    </form>
    <p className="auth-secondary"><Link href="/login">Back to sign in</Link></p>
  </section></main>;
}
