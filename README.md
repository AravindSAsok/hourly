# Hourly

Hourly is a private work-time tracker built with Next.js App Router, TypeScript, Supabase Auth, and PostgreSQL. It records source punch and break timestamps, then derives working time from those timestamps. The dashboard timer updates in the browser; it does not write to the database every second.

## Break rule

- A completed break shorter than 15 minutes is recorded but counts as paid work.
- A break of 15 minutes or longer is deducted in full.
- An open break is provisional: it is not deducted before 15 minutes, and its full elapsed duration is deducted after it reaches 15 minutes. Its recorded start is kept; the end is written only when the break ends or the user punches out.
- Correcting a completed break changes only its actual start/end timestamps. Reports and totals derive their classification again from the edited duration.

The calculation lives in `src/lib/time.ts` and is used by the dashboard, history, reports, and CSV export.

## Requirements

- Node.js 20.19 or later.
- pnpm 11 or a compatible package manager.
- A Supabase project with email/password authentication enabled.
- npm.

## Run locally

1. Install dependencies: `pnpm install`.
2. Copy `.env.example` to `.env.local` and fill in the Supabase Project URL, publishable key, and site URL.
3. Apply `supabase/migrations/202610290001_hourly.sql` in the Supabase SQL Editor (or with the Supabase CLI).
4. In Supabase Auth settings, set the Site URL to `http://localhost:3000` and add `http://localhost:3000/auth/callback` to the allowed redirect URLs.
5. Start the app with `pnpm dev` and open `http://localhost:3000`.

The same callback route is used for registration confirmation and password recovery. For production, add your deployed origin to Supabase’s allowed redirect URLs and set `NEXT_PUBLIC_SITE_URL` to that origin.

## Environment variables

- `NEXT_PUBLIC_SUPABASE_URL`: Supabase project URL.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: Supabase publishable/anon key. It is safe for browser use when RLS is enabled.
- `NEXT_PUBLIC_SITE_URL`: Origin used to build email confirmation and password reset callback links.

No service-role key is used by the application.

## Database and security

The migration creates `profiles`, `work_sessions`, and `breaks`, enables Row Level Security, and gives authenticated users read access only to their own rows. State changes run through narrowly scoped PostgreSQL functions that use `auth.uid()` and server/database timestamps. The functions lock an active session while starting/ending a break or punching out. A partial unique index prevents two active sessions for one user, and another prevents multiple open breaks in one session. Direct table writes are not granted to application roles.

The profile trigger uses the browser’s detected IANA timezone at registration when available, falling back to UTC. The timezone and week start are configurable in Settings. Daily and weekly summaries split net-working intervals at the user’s local calendar boundaries, including daylight-saving changes.

## Checks

Run unit tests with `pnpm test`. The tests cover breaks lasting 14:59, exactly 15:00, and 15:01, provisional classification of an open break, multiple breaks, midnight/week-boundary allocation, and a daylight-saving week. Run `pnpm typecheck` for TypeScript checks and `pnpm build` for a production build after installing dependencies.

Database integration checks need a configured Supabase project. The manual checklist below covers the authenticated state transitions and security boundaries.

## Manual verification checklist

- Register, confirm the email, sign in, reset the password, and sign out.
- Punch in, refresh the dashboard, and confirm the timer resumes from the saved timestamp.
- Start a break and verify the timer remains paid time until 15 minutes; at 15:00 it is provisionally deducted.
- End breaks at 14:59, 15:00, and 15:01. Verify the entire break is deducted only at 15:00 or later and that its recorded timestamps are unchanged.
- Start multiple breaks in one session and confirm their time is summed independently.
- Punch out during a break and confirm its end timestamp equals the session punch-out timestamp.
- Edit a completed break to cross the 15-minute boundary and verify dashboard, history, weekly report, and CSV values recalculate.
- Check sessions and breaks crossing local midnight, a week boundary, and a daylight-saving transition.
- Try duplicate clock-in/start-break/end-break/clock-out actions and confirm each invalid transition is rejected and persisted state refreshes.
- Use two accounts and confirm neither can read the other account’s records.
- Change week start, timezone, and weekly target. Confirm report grouping and target progress update.

## Deploy to Vercel

1. Push the project to a Git provider and import it into Vercel.
2. Add the three environment variables above in the Vercel project settings for the production deployment.
3. Set `NEXT_PUBLIC_SITE_URL` to the production HTTPS origin and add `https://your-domain.example/auth/callback` to the Supabase Auth redirect URL allowlist.
4. Apply the SQL migration to the production Supabase project.
5. Deploy, then verify registration/login, a complete punch/break cycle, and a CSV download.

Vercel and Supabase free-tier quotas and policies can change. Check their current plan limits before relying on a free-tier deployment.
