import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkLimit, clientIp } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

// RSHIR-20: deliberately NOT origin-checked. Read-only endpoint, called
// pre-auth from the signup form; locking it to same-origin would block
// legitimate cross-subdomain probes during pilot.
export async function GET(req: NextRequest) {
  // 60 lookups per IP per minute: capacity 60, refill 1/sec.
  const rl = checkLimit(`check-slug:${clientIp(req)}`, { capacity: 60, refillPerSec: 1 });
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
