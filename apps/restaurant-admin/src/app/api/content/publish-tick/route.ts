// POST /api/content/publish-tick
//
// Called by the Edge Function `content-os-publish-queue` cron at 12:00 UTC.
// Finds content_publications with status='queued' AND scheduled_for<=now()
// and dispatches each via the appropriate PublisherProvider (Meta/TikTok/
// LinkedIn/X), then marks the row published / failed.
//
// Stub for Lot 6: counts the queue so the cron has a signal. Full publish
// dispatch lands in a follow-up PR once provider OAuth tokens are in
// content_provider_credentials (post-onboarding wizard completion).

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

  const nowIso = new Date().toISOString();
  const { count, error } = await sb
    .from('content_publications')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'queued')
    .lte('scheduled_for', nowIso);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    stub: true,
    queued_publications_due: count ?? 0,
    note: 'Publisher dispatch lands in follow-up PR once OAuth tokens ship.',
    timestamp: nowIso,
  });
}
