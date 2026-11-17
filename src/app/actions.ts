"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { localDateTimeToEpoch } from "@/lib/time";
import { getProfileAndUser } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";

const credentials = z.object({ email: z.string().email(), password: z.string().min(8).max(128) });

function field(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

function rawField(formData: FormData, name: string) {
  return String(formData.get(name) ?? "");
}

function siteOrigin() {
  return (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/+$/, "");
}

function actionError(error: { message: string }) {
  const message = error.message.toLowerCase();
  if (message.includes("already have an open")) return "You already have an open work session.";
  if (message.includes("already on a break")) return "You are already on a break.";
  if (message.includes("no open")) return "There is no active session or break for that action.";
  if (message.includes("invalid login") || message.includes("invalid credentials")) return "Email or password is incorrect.";
  return error.message.length < 180 ? error.message : "That action could not be completed. Please try again.";
}

export async function signInAction(formData: FormData) {
  const parsed = credentials.safeParse({ email: field(formData, "email"), password: rawField(formData, "password") });
  if (!parsed.success) redirect("/login?error=Enter%20a%20valid%20email%20and%20password%20of%20at%20least%208%20characters.");
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) redirect(`/login?error=${encodeURIComponent(actionError(error))}`);
  redirect("/dashboard");
}

export async function registerAction(formData: FormData) {
  const displayName = field(formData, "display_name");
  const parsed = credentials.safeParse({ email: field(formData, "email"), password: rawField(formData, "password") });
  if (!parsed.success) redirect("/register?error=Enter%20a%20valid%20email%20and%20password%20of%20at%20least%208%20characters.");
  const zone = field(formData, "time_zone") || "UTC";
  try { new Intl.DateTimeFormat("en-US", { timeZone: zone }); } catch { redirect("/register?error=Your%20browser%20timezone%20could%20not%20be%20read."); }
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    ...parsed.data,
    options: {
      data: { display_name: displayName, time_zone: zone },
      emailRedirectTo: `${siteOrigin()}/auth/callback?next=/dashboard`,
    },
  });
  if (error) redirect(`/register?error=${encodeURIComponent(actionError(error))}`);
  if (data.session) redirect("/dashboard");
  redirect("/login?checkEmail=1");
}

export async function forgotPasswordAction(formData: FormData) {
  const email = z.string().email().safeParse(field(formData, "email"));
  if (!email.success) redirect("/forgot-password?error=Enter%20a%20valid%20email%20address.");
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email.data, {
    redirectTo: `${siteOrigin()}/auth/callback?next=/reset-password`,
  });
  if (error) redirect(`/forgot-password?error=${encodeURIComponent(actionError(error))}`);
  redirect("/forgot-password?sent=1");
}

export async function updatePasswordAction(formData: FormData) {
  const password = z.string().min(8).max(128).safeParse(rawField(formData, "password"));
  if (!password.success) redirect("/reset-password?error=Use%20a%20password%20with%20at%20least%208%20characters.");
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: password.data });
  if (error) redirect(`/reset-password?error=${encodeURIComponent(actionError(error))}`);
  redirect("/dashboard");
}

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function clockAction(formData: FormData): Promise<{ ok: boolean; message?: string }> {
  const operation = field(formData, "operation");
  const rpcName = operation === "clock-in" ? "clock_in" : operation === "start-break" ? "start_break" : operation === "end-break" ? "end_break" : "clock_out";
  if (!["clock-in", "start-break", "end-break", "clock-out"].includes(operation)) {
    return { ok: false, message: "Invalid clock action." };
  }
  const clickedAt = z.string().datetime({ offset: true }).safeParse(field(formData, "clicked_at"));
  if (!clickedAt.success) return { ok: false, message: "The click time could not be recorded. Please try again." };

  try {
    const supabase = await createClient();
    // New databases persist the exact browser click time. Fall back to the legacy
    // no-argument RPC until the matching timestamp migration has been applied.
    let result = await supabase.rpc(rpcName, { p_occurred_at: clickedAt.data });
    if (result.error && (
      result.error.code === "PGRST202" ||
      result.error.code === "42883" ||
      result.error.message.toLowerCase().includes("could not find the function")
    )) {
      result = await supabase.rpc(rpcName);
    }
    if (result.error) return { ok: false, message: actionError(result.error) };
    revalidatePath("/dashboard");
    revalidatePath("/history");
    revalidatePath("/reports");
    return { ok: true };
  } catch {
    return { ok: false, message: "We could not confirm that clock action. Your saved time has not been changed; please try again." };
  }
}

export async function savePreferencesAction(formData: FormData) {
  const targetHours = Number(field(formData, "weekly_target_hours"));
  const targetMinutes = Math.round(targetHours * 60);
  const weekStartsOn = Number(field(formData, "week_starts_on"));
  const displayName = field(formData, "display_name").slice(0, 80);
  const timeZone = field(formData, "time_zone");
  if (!Number.isFinite(targetHours) || targetMinutes < 60 || targetMinutes > 10080 || !Number.isInteger(weekStartsOn)) {
    redirect("/settings?error=Enter%20a%20valid%20weekly%20target%20and%20week%20start.");
  }
  try { new Intl.DateTimeFormat("en-US", { timeZone }); } catch { redirect("/settings?error=Enter%20a%20valid%20IANA%20timezone."); }
  const supabase = await createClient();
  let error: { message: string } | null = null;
  try {
    const result = await supabase.rpc("update_preferences", {
      p_display_name: displayName,
      p_weekly_target_minutes: targetMinutes,
      p_week_starts_on: weekStartsOn,
      p_time_zone: timeZone,
    });
    error = result.error;
  } catch {
    redirect("/settings?error=We%20could%20not%20confirm%20that%20save.%20Reload%20settings%20to%20check%20the%20saved%20values.");
  }
  if (error) redirect(`/settings?error=${encodeURIComponent(actionError(error))}`);
  revalidatePath("/dashboard");
  revalidatePath("/history");
  revalidatePath("/reports");
  revalidatePath("/settings");
  redirect("/settings?saved=1");
}

export async function savePlannedLeavingTimeAction(plannedLeavingTime: string): Promise<{ ok: boolean; message?: string }> {
  const parsed = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/).safeParse(plannedLeavingTime);
  if (!parsed.success) return { ok: false, message: "Choose a valid leaving time." };
  const { supabase } = await getProfileAndUser();
  let error: { message: string } | null = null;
  try {
    const result = await supabase.rpc("update_planned_leaving_time", {
      p_planned_leaving_time: parsed.data,
    });
    error = result.error;
  } catch {
    return { ok: false, message: "We could not save your leaving time. Please try again." };
  }
  if (error) return { ok: false, message: actionError(error) };
  return { ok: true };
}

export async function editBreakAction(formData: FormData) {
  const breakId = z.string().uuid().safeParse(field(formData, "break_id"));
  if (!breakId.success) redirect("/history?error=The%20break%20record%20could%20not%20be%20identified.");
  const startLocal = field(formData, "start_local");
  const endLocal = field(formData, "end_local");
  const { supabase, profile } = await getProfileAndUser();
  let startAt: string;
  let endAt: string;
  try {
    startAt = new Date(localDateTimeToEpoch(startLocal, profile.time_zone)).toISOString();
    endAt = new Date(localDateTimeToEpoch(endLocal, profile.time_zone)).toISOString();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Enter valid local timestamps.";
    redirect(`/history?error=${encodeURIComponent(message)}`);
  }
  let error: { message: string } | null = null;
  try {
    const result = await supabase.rpc("edit_break", {
      p_break_id: breakId.data,
      p_start_at: startAt,
      p_end_at: endAt,
    });
    error = result.error;
  } catch {
    redirect("/history?error=We%20could%20not%20confirm%20the%20break%20correction.%20Reload%20history%20to%20check%20the%20saved%20timestamps.");
  }
  if (error) redirect(`/history?error=${encodeURIComponent(actionError(error))}`);
  revalidatePath("/dashboard");
  revalidatePath("/history");
  revalidatePath("/reports");
  redirect("/history?saved=1");
}

export async function deleteWorkDayAction(formData: FormData) {
  const dayKey = z.string().regex(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/).safeParse(field(formData, "day_key"));
  if (!dayKey.success) redirect("/history?error=The%20selected%20day%20could%20not%20be%20identified.");
  const { supabase, profile } = await getProfileAndUser();
  let error: { message: string } | null = null;
  try {
    const result = await supabase.rpc("delete_work_day", {
      p_day: dayKey.data,
      p_time_zone: profile.time_zone,
    });
    error = result.error;
  } catch {
    redirect("/history?error=We%20could%20not%20confirm%20the%20day%20deletion.%20Reload%20history%20to%20check%20the%20saved%20records.");
  }
  if (error) redirect(`/history?error=${encodeURIComponent(actionError(error))}`);
  revalidatePath("/dashboard");
  revalidatePath("/history");
  revalidatePath("/reports");
  redirect("/history?deleted=1");
}

export async function editPunchOutAction(formData: FormData) {
  const sessionId = z.string().uuid().safeParse(field(formData, "session_id"));
  if (!sessionId.success) redirect("/history?error=The work session could not be identified.");
  const clockOutLocal = field(formData, "clock_out_local");
  const { supabase, profile } = await getProfileAndUser();
  let clockOutAt: string;
  try {
    clockOutAt = new Date(localDateTimeToEpoch(clockOutLocal, profile.time_zone)).toISOString();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Enter a valid local timestamp.";
    redirect(`/history?error=${encodeURIComponent(message)}`);
  }
  let error: { message: string } | null = null;
  try {
    const result = await supabase.rpc("edit_session_punch_out", {
      p_session_id: sessionId.data,
      p_clock_out_at: clockOutAt,
    });
    error = result.error;
  } catch {
    redirect("/history?error=We could not confirm the punch-out correction. Reload history to check the saved timestamp.");
  }
  if (error) redirect(`/history?error=${encodeURIComponent(actionError(error))}`);
  revalidatePath("/dashboard");
  revalidatePath("/history");
  revalidatePath("/reports");
  redirect("/history?saved=1");
}
