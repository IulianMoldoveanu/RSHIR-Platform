// POST /api/content/reflect-tick
//
// Reflection tick — called by Supabase Edge Function `content-os-reflect`
// daily at 22:00 UTC (see pg_cron migration 20260628_002).
//
// For each published publication older than 24h that lacks fresh metrics,
// pull metrics from the publisher and insert content_metrics. Templates
// with CTR > 3× the 30-day baseline get promoted into a new
// content_templates row tagged `created_by='reflection_promoted'`.

import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { runReflectTick } from '@/lib/content-os/reflect';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function isAuthorized(req: Request): boolean {
  const expected = process.env.CONTENT_OS_CRON_TOKEN;
  if (!expected) return false;
  const auth = req.headers.get('authorization') ?? '';
  return auth === `Bearer ${expected}`;
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    const admin = createAdminClient();
    const stats = await runReflectTick({ admin });
    return NextResponse.json({
      ok: true,
      stats,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
