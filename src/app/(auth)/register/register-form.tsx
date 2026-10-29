"use client";

import { useEffect, useState } from "react";
import { ActionButton } from "@/components/action-button";
import { registerAction } from "@/app/actions";

export function RegisterForm() {
  const [timeZone, setTimeZone] = useState("UTC");
  useEffect(() => {
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (detected) setTimeZone(detected);
  }, []);
  return <form className="auth-form" action={registerAction}>
    <input type="hidden" name="time_zone" value={timeZone} />
    <label>Name <span className="optional">Optional</span><input name="display_name" type="text" autoComplete="name" maxLength={80} placeholder="Your name" /></label>
    <label>Email<input name="email" type="email" autoComplete="email" required placeholder="you@example.com" /></label>
    <label>Password<input name="password" type="password" autoComplete="new-password" required minLength={8} aria-describedby="password-help" /><small id="password-help">At least 8 characters.</small></label>
    <ActionButton label="Create account" pendingLabel="Creating account…" className="button button-primary full-width" />
  </form>;
}
