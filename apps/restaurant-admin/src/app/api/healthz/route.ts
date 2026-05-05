import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Lane HEALTHZ (2026-05-05): per-service synchronous self-check.
// See restaurant-web's twin for the full rationale. The shape stays
// in sync across all 3 apps so the `health-monitor` Edge Function and
// the public /status page can treat them uniformly.
//
// restaurant-admin has no Stripe webhook surface — that probe is
// elided here.

type Probe = { ok: boolean; latency_ms: number; error?: string };

const PROBE_TIMEOUT_MS = 800;

async function probeDb(): Promise<Probe> {
  const t0 = Date.now();
  try {
    const admin = createAdminClient();
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
    const admin = createAdminClient();
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
    const admin = createAdminClient();
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

  const ok = db.ok && auth.ok;
  const total_ms = Date.now() - startedAt;

  return NextResponse.json(
    {
      ok,
      service: 'restaurant-admin',
      version: process.env.NEXT_PUBLIC_GIT_SHA ?? process.env.VERCEL_GIT_COMMIT_SHA ?? 'dev',
      env: process.env.VERCEL_ENV ?? 'local',
      ts: new Date().toISOString(),
      total_ms,
      checks: {
        db,
        auth,
        supabase_storage,
      },
    },
    {
      status: ok ? 200 : 503,
      headers: { 'Cache-Control': 'no-store, max-age=0, must-revalidate' },
    },
  );
}
