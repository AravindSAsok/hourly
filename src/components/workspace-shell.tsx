"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, CalendarDays, ChartNoAxesColumnIncreasing, Clock3, LogOut, Settings2 } from "lucide-react";
import { signOutAction } from "@/app/actions";
import type { Profile } from "@/lib/data";

const links = [
  { href: "/dashboard", label: "Dashboard", icon: Clock3 },
  { href: "/history", label: "History", icon: CalendarDays },
  { href: "/reports", label: "Reports", icon: ChartNoAxesColumnIncreasing },
  { href: "/settings", label: "Settings", icon: Settings2 },
];

export function WorkspaceShell({ profile, email, children }: {
  profile: Profile;
  email: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const title = profile.display_name?.trim() || email.split("@")[0] || "Account";
  return <div className="app-frame">
    <aside className="sidebar">
      <Link className="brand" href="/dashboard"><span className="brand-mark"><Activity size={19} /></span><span>hourly</span></Link>
      <div className="sidebar-caption">WORKSPACE</div>
      <nav aria-label="Main navigation" className="side-nav">
        {links.map(({ href, label, icon: Icon }) => <Link key={href} href={href} aria-current={pathname === href ? "page" : undefined} className={`nav-link ${pathname === href ? "active" : ""}`}>
          <Icon size={18} strokeWidth={1.8} /><span>{label}</span>
        </Link>)}
      </nav>
      <div className="sidebar-bottom">
        <div className="account-card">
          <div className="avatar" aria-hidden="true">{title.slice(0, 1).toUpperCase()}</div>
          <div className="account-copy"><strong>{title}</strong><span>{email}</span></div>
          <form action={signOutAction}><button className="icon-button" aria-label="Sign out" title="Sign out"><LogOut size={17} /></button></form>
        </div>
      </div>
    </aside>
    <div className="main-column">
      <header className="topbar">
        <div className="topbar-mobile-brand"><span className="brand-mark"><Activity size={17} /></span> hourly</div>
        <div className="topbar-date">{new Intl.DateTimeFormat("en", { dateStyle: "full", timeZone: profile.time_zone }).format(new Date())}</div>
        <Link className="topbar-settings" href="/settings"><Settings2 size={17} /> Preferences</Link>
        <form action={signOutAction} className="topbar-logout"><button className="icon-button" aria-label="Sign out" title="Sign out"><LogOut size={17} /></button></form>
      </header>
      <main className="main-content">{children}</main>
    </div>
  </div>;
}
