import Link from "next/link";
import { AlertCircle } from "lucide-react";
import { ActionButton } from "@/components/action-button";
import { signInAction } from "@/app/actions";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; checkEmail?: string }> }) {
  const query = await searchParams;
  return <main className="auth-page"><section className="auth-card">
    <Link className="brand" href="/"><span className="brand-mark">h</span><span>hourly</span></Link>
    <p className="eyebrow">WELCOME BACK</p><h1>Sign in</h1><p>Your workday is right where you left it.</p>
    {query.error && <div className="notice notice-error auth-message" role="alert"><AlertCircle size={16} />{query.error}</div>}
    {query.checkEmail && <div className="notice notice-success auth-message">Check your inbox to confirm your account, then sign in.</div>}
    <form className="auth-form" action={signInAction}>
      <label>Email<input name="email" type="email" autoComplete="email" required placeholder="you@example.com" /></label>
      <label>Password<input name="password" type="password" autoComplete="current-password" required minLength={8} /></label>
      <ActionButton label="Sign in" pendingLabel="Signing in…" className="button button-primary full-width" />
    </form>
    <div className="auth-links"><Link href="/forgot-password">Forgot password?</Link><Link href="/register">Create account</Link></div>
  </section></main>;
}
