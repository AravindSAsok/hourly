import { AlertCircle, ArrowRight } from "lucide-react";
import { LiveDashboard } from "@/components/live-dashboard";
import { getProfileAndUser, getRecentSessions } from "@/lib/data";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const [{ profile }, sessions, query] = await Promise.all([getProfileAndUser(), getRecentSessions(400), searchParams]);
  return <div className="page-stack">
    <div className="page-heading"><div><div className="eyebrow">CURRENT OVERVIEW</div><h1>Your workday</h1><p>Keep your time clear and your week in balance.</p></div><a className="text-link" href="/history">View history <ArrowRight size={16} /></a></div>
    {query.error && <div className="notice notice-error" role="alert"><AlertCircle size={17} />{query.error}</div>}
    <LiveDashboard profile={profile} sessions={sessions} initialNow={Date.now()} />
  </div>;
}
