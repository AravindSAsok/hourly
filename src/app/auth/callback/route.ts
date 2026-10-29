import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const requestedNext = request.nextUrl.searchParams.get("next") ?? "/dashboard";
  const next = requestedNext.startsWith("/") && !requestedNext.startsWith("//") && !requestedNext.includes("\\")
    ? requestedNext
    : "/dashboard";
  if (!code) return NextResponse.redirect(new URL("/login?error=The%20confirmation%20link%20has%20expired.", request.url));
  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent("That confirmation link has expired. Request a new one and try again.")}`, request.url));
  return NextResponse.redirect(new URL(next, request.url));
}
