// POST /api/content/generate-tick
//
// Daily generation tick — called by Supabase Edge Function
// `content-os-generate` at 06:00 UTC (see pg_cron migration
// 20260628_002_content_os_cron_schedule.sql).
//
// For each active brand without a brief in the last 24h, runs the full
// agent pipeline (TemplatePicker → Copywriter → SEO → VisualDirector →
// VideoGen) and inserts content_briefs + content_drafts rows. Standard-plan
// caps are enforced atomically via `checkAndIncrementUsage` BEFORE video
// gen so we never burn a Pika/Runway credit on an over-cap brand.

import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { runGenerateTick } from '@/lib/content-os/generate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Cron handlers may run >10s on a large tenant set; allow up to 60s.
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
    const stats = await runGenerateTick({ admin });
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
