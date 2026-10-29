import { redirect } from "next/navigation";
import type { BreakEditRecord, BreakRecord, WorkSession } from "@/lib/time";
import { createClient } from "@/lib/supabase/server";

export type Profile = {
  id: string;
  display_name: string | null;
  weekly_target_minutes: number;
  week_starts_on: number;
  time_zone: string;
};

export type StoredSession = WorkSession & {
  id: string;
  user_id: string;
  status: "working" | "on_break" | "completed";
  manually_edited: boolean;
  created_at: string;
};

function mapSession(row: any): StoredSession {
  const breaks: BreakRecord[] = (row.breaks ?? []).map((item: any) => ({
    id: item.id,
    break_start_at: item.break_start_at,
    break_end_at: item.break_end_at,
    edits: (item.break_edits ?? []).map((edit: any): BreakEditRecord => ({
      previous_break_start_at: edit.previous_break_start_at,
      previous_break_end_at: edit.previous_break_end_at,
      new_break_start_at: edit.new_break_start_at,
      new_break_end_at: edit.new_break_end_at,
      edited_at: edit.edited_at,
    })).sort((a: BreakEditRecord, b: BreakEditRecord) => a.edited_at.localeCompare(b.edited_at)),
  })).sort((a: BreakRecord, b: BreakRecord) => a.break_start_at.localeCompare(b.break_start_at));
  return { ...row, breaks } as StoredSession;
}

export async function getProfileAndUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data, error } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  if (error) throw new Error(`Could not load your profile: ${error.message}`);
  if (!data) throw new Error("Your profile is not ready yet. Please sign out and sign in again.");
  return { supabase, user, profile: data as Profile };
}

export async function getRecentSessions(limit = 250): Promise<StoredSession[]> {
  const { supabase, user } = await getProfileAndUser();
  const { data, error } = await supabase
    .from("work_sessions")
    .select("id,user_id,clock_in_at,clock_out_at,status,manually_edited,created_at,breaks(id,break_start_at,break_end_at,break_edits(previous_break_start_at,previous_break_end_at,new_break_start_at,new_break_end_at,edited_at))")
    .eq("user_id", user.id)
    .order("clock_in_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Could not load work history: ${error.message}`);
  return (data ?? []).map(mapSession);
}

export async function getHistoryPage(page: number, pageSize = 40): Promise<{ sessions: StoredSession[]; count: number }> {
  const { supabase, user } = await getProfileAndUser();
  const start = (page - 1) * pageSize;
  const { data, error, count } = await supabase
    .from("work_sessions")
    .select("id,user_id,clock_in_at,clock_out_at,status,manually_edited,created_at,breaks(id,break_start_at,break_end_at,break_edits(previous_break_start_at,previous_break_end_at,new_break_start_at,new_break_end_at,edited_at))", { count: "exact" })
    .eq("user_id", user.id)
    .order("clock_in_at", { ascending: false })
    .range(start, start + pageSize - 1);
  if (error) throw new Error(`Could not load work history: ${error.message}`);
  return { sessions: (data ?? []).map(mapSession), count: count ?? 0 };
}

export async function getSessionsOverlapping(start: number, end: number): Promise<StoredSession[]> {
  const { supabase, user } = await getProfileAndUser();
  const startIso = new Date(start).toISOString();
  const endIso = new Date(end).toISOString();
  const { data, error } = await supabase
    .from("work_sessions")
    .select("id,user_id,clock_in_at,clock_out_at,status,manually_edited,created_at,breaks(id,break_start_at,break_end_at,break_edits(previous_break_start_at,previous_break_end_at,new_break_start_at,new_break_end_at,edited_at))")
    .eq("user_id", user.id)
    .lt("clock_in_at", endIso)
    .or(`clock_out_at.is.null,clock_out_at.gt.${startIso}`)
    .order("clock_in_at", { ascending: true });
  if (error) throw new Error(`Could not load weekly report: ${error.message}`);
  return (data ?? []).map(mapSession);
}
