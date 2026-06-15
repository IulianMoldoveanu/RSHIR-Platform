// GET /api/fleet/anaf-lookup?cui=XXX
// Server-side proxy to ANAF (free public API) for the /fleet/kyf form.
// 2026-06-15 — Iulian directive: when fleet manager types CUI on KYF page,
// auto-fetch company data and prefill name/address/regCom/CAEN/VAT/active.
//
// Auth: requires a logged-in user who owns a courier_fleets row (same gate
// as the KYF page itself). Rate-limited per IP (10/min) to avoid hammering
// the public ANAF API.

import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { lookupAnaf, normaliseCui } from '@/lib/anaf';
import { checkLimit, clientIp } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const supa = await createServerClient();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  // Must own a fleet — same gate as /fleet/kyf.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const { data: fleet } = await admin
    .from('courier_fleets')
    .select('id')
    .eq('owner_user_id', user.id)
    .limit(1)
    .maybeSingle();
  if (!fleet) {
    return NextResponse.json({ error: 'no_fleet' }, { status: 403 });
  }

  const rl = checkLimit(`anaf:${clientIp(req)}`, { capacity: 10, refillPerSec: 1 / 6 });
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'rate_limited' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    );
  }

  const cui = req.nextUrl.searchParams.get('cui') ?? '';
  if (!normaliseCui(cui)) {
    return NextResponse.json({ error: 'invalid_cui' }, { status: 400 });
  }

  const data = await lookupAnaf(cui);
  if (!data) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  return NextResponse.json({ ok: true, company: data });
}
