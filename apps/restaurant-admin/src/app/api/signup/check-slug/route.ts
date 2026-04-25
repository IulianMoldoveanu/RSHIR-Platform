import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkLimit, clientIp } from '@/lib/rate-limit';
import { assertSameOrigin } from '@/lib/origin-check';

export const dynamic = 'force-dynamic';

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

// RSHIR-22: same-origin + 10/min/IP. Sprint-4 audit (H4) flagged this as
// open cross-origin enumeration: legit usage all comes from the signup
// form on the same origin, so blocking cross-origin probes costs nothing.
export async function GET(req: NextRequest) {
  const origin = assertSameOrigin(req);
  if (!origin.ok) {
    return NextResponse.json({ error: 'forbidden', reason: origin.reason }, { status: 403 });
  }

  const rl = checkLimit(`check-slug:${clientIp(req)}`, { capacity: 10, refillPerSec: 10 / 60 });
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'rate_limited' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    );
  }

  const slug = req.nextUrl.searchParams.get('slug')?.trim().toLowerCase() ?? '';
  if (slug.length < 3 || slug.length > 30 || !SLUG_RE.test(slug)) {
    return NextResponse.json({ available: false, reason: 'invalid' });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('tenants')
    .select('id')
    .eq('slug', slug)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ available: !data });
}
