import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";

export default async function Home() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    return <main className="auth-page"><section className="auth-card config-card"><div className="brand brand-static"><span className="brand-mark">h</span><span>hourly</span></div><p className="eyebrow">ONE QUICK SETUP</p><h1>Connect your Supabase project</h1><p className="muted">Add the URL and publishable key from your Supabase project to <code>.env.local</code>, then restart the app.</p><pre className="env-snippet">NEXT_PUBLIC_SUPABASE_URL=…<br />NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=…</pre></section></main>;
  }
  const { user } = await getUser();
  redirect(user ? "/dashboard" : "/login");
}
