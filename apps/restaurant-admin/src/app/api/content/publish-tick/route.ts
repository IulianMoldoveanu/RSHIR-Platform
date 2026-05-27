// POST /api/content/publish-tick
//
// Publish-queue tick — called by Supabase Edge Function
// `content-os-publish-queue` hourly (see pg_cron migration
// 20260628_002_content_os_cron_schedule.sql).
//
// Picks up content_publications rows with status='queued' AND
// scheduled_for<=now() and dispatches each via the matching
// PublisherProvider (Meta/IG/TikTok/LinkedIn/X), updating status on
// success/failure. When credentials are missing for a (brand, channel)
// pair, the row is marked failed with a clear "conectează X din onboarding"
// message — expected state until the OAuth onboarding wizard ships.

import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { runPublishTick } from '@/lib/content-os/publish';

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
    const stats = await runPublishTick({ admin });
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
