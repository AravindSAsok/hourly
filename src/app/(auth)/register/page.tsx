import Link from "next/link";
import { AlertCircle } from "lucide-react";
import { RegisterForm } from "./register-form";

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const query = await searchParams;
  return <main className="auth-page"><section className="auth-card">
    <Link className="brand" href="/"><span className="brand-mark">h</span><span>hourly</span></Link>
    <p className="eyebrow">A CLEARER WORKWEEK</p><h1>Create your account</h1><p>Start tracking sessions, breaks, and weekly progress.</p>
    {query.error && <div className="notice notice-error auth-message" role="alert"><AlertCircle size={16} />{query.error}</div>}
    <RegisterForm />
    <p className="auth-secondary">Already have an account? <Link href="/login">Sign in</Link></p>
  </section></main>;
}
