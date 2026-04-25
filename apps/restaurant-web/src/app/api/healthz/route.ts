import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// RSHIR-40: liveness + DB-connectivity probe. Designed to be hit by an
// external uptime monitor (UptimeRobot / Vercel cron / Better Stack).
// Returns 503 when the Supabase round-trip exceeds 800ms or fails so the
// monitor can page on real DB issues, not just Vercel function cold starts.
export async function GET() {
  const startedAt = Date.now();

  let dbOk = false;
  let dbErrorMsg: string | null = null;
  let dbLatencyMs: number | null = null;
  try {
    const admin = getSupabaseAdmin();
    const t0 = Date.now();
    // count: 'exact', head: true is the cheapest possible query: no rows
    // returned, just the count from the planner. No-op against a small
    // tenants table.
    const { error } = await admin
      .from('tenants')
      .select('id', { count: 'exact', head: true });
    dbLatencyMs = Date.now() - t0;
    if (error) {
      dbErrorMsg = error.message;
    } else {
      dbOk = true;
    }
  } catch (e: unknown) {
    dbErrorMsg = e instanceof Error ? e.message : 'unknown';
  }

  const totalMs = Date.now() - startedAt;
  const slow = dbLatencyMs !== null && dbLatencyMs > 800;
  const ok = dbOk && !slow;

  return NextResponse.json(
    {
      ok,
      app: 'restaurant-web',
      db: { ok: dbOk, latencyMs: dbLatencyMs, error: dbErrorMsg },
      totalMs,
      buildSha: process.env.VERCEL_GIT_COMMIT_SHA ?? 'dev',
      env: process.env.VERCEL_ENV ?? 'local',
      ts: new Date().toISOString(),
    },
    { status: ok ? 200 : 503 },
  );
}
