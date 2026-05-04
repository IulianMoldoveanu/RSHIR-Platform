import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const startedAt = Date.now();

  let dbOk = false;
  let dbErrorMsg: string | null = null;
  let dbLatencyMs: number | null = null;
  try {
    const admin = createAdminClient();
    const t0 = Date.now();
    const { error } = await admin
      .from('tenants')
      .select('id', { count: 'exact', head: true });
    dbLatencyMs = Date.now() - t0;
    if (error) {
      console.error('[healthz] db error', error.message);
      dbErrorMsg = 'db_error';
    } else {
      dbOk = true;
    }
  } catch (e: unknown) {
    console.error('[healthz] db exception', e instanceof Error ? e.message : e);
    dbErrorMsg = 'db_exception';
  }

  const totalMs = Date.now() - startedAt;
  const slow = dbLatencyMs !== null && dbLatencyMs > 800;
  const ok = dbOk && !slow;

  return NextResponse.json(
    {
      ok,
      app: 'restaurant-courier',
      db: { ok: dbOk, latencyMs: dbLatencyMs, error: dbErrorMsg },
      totalMs,
      buildSha: process.env.VERCEL_GIT_COMMIT_SHA ?? 'dev',
      env: process.env.VERCEL_ENV ?? 'local',
      ts: new Date().toISOString(),
    },
    {
      status: ok ? 200 : 503,
      // Lane M: see restaurant-web/healthz — every probe MUST run the DB
      // round-trip so a cached 200 cannot mask a real outage.
      headers: { 'Cache-Control': 'no-store, max-age=0, must-revalidate' },
    },
  );
}
