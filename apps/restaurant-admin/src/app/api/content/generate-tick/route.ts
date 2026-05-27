// POST /api/content/generate-tick
//
// Called by the Edge Function `content-os-generate` cron at 06:00 UTC.
// For each active brand × pillar rotation, this endpoint will trigger
// the agent pipeline (TemplatePicker → Copywriter → SEO → VisualDirector
// → VideoGen) and insert drafts.
//
// This is a stub for Lot 6 — full wiring of the @hir/content-os agents
// against env-supplied provider credentials lands in a follow-up PR
// once we have API keys for Runway/Pika/Meta in prod env vars. Codex
// P1 absorb: keep the endpoint reachable so the cron doesn't 404.

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

  // For now: count active brands so the cron has a real signal that the
  // pipeline ran. Full agent wiring lands when credentials are in prod env.
  const { count, error } = await sb
    .from('content_brand_contexts')
    .select('id', { count: 'exact', head: true })
    .eq('is_active', true);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    stub: true,
    active_brands: count ?? 0,
    note: 'Agent pipeline wiring lands in follow-up PR once API keys ship.',
    timestamp: new Date().toISOString(),
  });
}
