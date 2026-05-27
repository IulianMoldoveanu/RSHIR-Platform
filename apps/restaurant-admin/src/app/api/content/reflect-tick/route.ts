// POST /api/content/reflect-tick
//
// Called by the Edge Function `content-os-reflect` cron at 22:00 UTC.
// Pulls metrics from publishers for posts published in the last 7 days,
// stores them in content_metrics, and promotes high-CTR templates
// (Reflection learning loop).
//
// Stub for Lot 6 — same shape as the other ticks. Full metric pull
// lands when publisher provider OAuth tokens are present per brand.

import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createAdminClient() as any;

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { count, error } = await sb
    .from('content_publications')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'published')
    .gte('published_at', sevenDaysAgo);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    stub: true,
    publications_in_window: count ?? 0,
    note: 'Metric pull + template promotion lands in follow-up PR.',
    timestamp: new Date().toISOString(),
  });
}
