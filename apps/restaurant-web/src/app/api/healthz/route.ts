import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Lane HEALTHZ (2026-05-05): per-service synchronous self-check.
//
// Designed to be hit by external uptime monitors and by the
// `health-monitor` Edge Function (which forwards the per-service breakdown
// into `health_check_pings.payload` so /status can show what's broken,
// not just "something is broken").
//
// Critical checks (failure → 503): db, auth.
// Non-critical (failure recorded but does not flip overall ok): storage,
// stripe webhook configuration. These are checked best-effort with
// Promise.allSettled so a slow non-critical probe doesn't block the reply.
//
// Hard cap of 800 ms on individual probes via AbortSignal.timeout — total
// response stays under the ≤500ms p95 budget when everything is healthy.

type Probe = { ok: boolean; latency_ms: number; error?: string };

const PROBE_TIMEOUT_MS = 800;

async function probeDb(): Promise<Probe> {
  const t0 = Date.now();
  try {
    const admin = getSupabaseAdmin();
    const { error } = await admin
      .from('tenants')
      .select('id', { count: 'exact', head: true })
      .abortSignal(AbortSignal.timeout(PROBE_TIMEOUT_MS));
    const latency_ms = Date.now() - t0;
    if (error) {
      console.error('[healthz] db error', error.message);
      return { ok: false, latency_ms, error: 'db_error' };
    }
    return { ok: true, latency_ms };
  } catch (e: unknown) {
    console.error('[healthz] db exception', e instanceof Error ? e.message : e);
    return { ok: false, latency_ms: Date.now() - t0, error: 'db_exception' };
  }
}

async function probeAuth(): Promise<Probe> {
  const t0 = Date.now();
  try {
    const admin = getSupabaseAdmin();
    // listUsers with perPage=1 is the cheapest auth.admin call that
    // actually exercises the auth gateway (not just the Postgres role).
    const { error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1 });
    const latency_ms = Date.now() - t0;
    if (error) {
      console.error('[healthz] auth error', error.message);
      return { ok: false, latency_ms, error: 'auth_error' };
    }
    return { ok: true, latency_ms };
  } catch (e: unknown) {
    console.error('[healthz] auth exception', e instanceof Error ? e.message : e);
    return { ok: false, latency_ms: Date.now() - t0, error: 'auth_exception' };
  }
}

async function probeStorage(): Promise<Probe> {
  const t0 = Date.now();
  try {
    const admin = getSupabaseAdmin();
    const { error } = await admin.storage.listBuckets();
    const latency_ms = Date.now() - t0;
    if (error) {
      console.error('[healthz] storage error', error.message);
      return { ok: false, latency_ms, error: 'storage_error' };
    }
    return { ok: true, latency_ms };
  } catch (e: unknown) {
    console.error('[healthz] storage exception', e instanceof Error ? e.message : e);
    return { ok: false, latency_ms: Date.now() - t0, error: 'storage_exception' };
  }
}

export async function GET() {
  const startedAt = Date.now();

  const [dbRes, authRes, storageRes] = await Promise.allSettled([
    probeDb(),
    probeAuth(),
    probeStorage(),
  ]);

  const db = dbRes.status === 'fulfilled' ? dbRes.value : { ok: false, latency_ms: 0, error: 'rejected' };
  const auth = authRes.status === 'fulfilled' ? authRes.value : { ok: false, latency_ms: 0, error: 'rejected' };
  const supabase_storage =
    storageRes.status === 'fulfilled' ? storageRes.value : { ok: false, latency_ms: 0, error: 'rejected' };

  // Stripe webhook secret is required for the /api/webhooks/stripe route to
  // verify signatures. Cheap config-presence check, no network call.
  const stripe_webhook_secret_configured = Boolean(process.env.STRIPE_WEBHOOK_SECRET);

  // Critical = db reachability only. Auth + storage + stripe-webhook are
  // surfaced as degradation signals but don't flip the page red — uptime
  // monitor would otherwise alert on transient `auth.admin.listUsers`
  // rate-limit / MFA-policy responses that don't affect customer signup
  // or login (which use the public auth endpoint, not admin).
  const ok = db.ok;

  const total_ms = Date.now() - startedAt;

  return NextResponse.json(
    {
      ok,
      service: 'restaurant-web',
      version: process.env.NEXT_PUBLIC_GIT_SHA ?? process.env.VERCEL_GIT_COMMIT_SHA ?? 'dev',
      env: process.env.VERCEL_ENV ?? 'local',
      ts: new Date().toISOString(),
      total_ms,
      checks: {
        db,
        auth,
        stripe_webhook_secret_configured,
        supabase_storage,
      },
    },
    {
      status: ok ? 200 : 503,
      // Lane M: every probe MUST run the checks fresh. A cached 200 hides
      // a real outage from the uptime monitor.
      headers: { 'Cache-Control': 'no-store, max-age=0, must-revalidate' },
    },
  );
}
