// GET /api/fleet-signup/check-slug?slug=foo — fleet slug availability check.
// Mirrors /api/signup/check-slug but scoped to courier_fleets.

import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

export async function GET(req: NextRequest) {
  const slug = (req.nextUrl.searchParams.get('slug') ?? '').trim().toLowerCase();
  if (!slug || slug.length < 3 || slug.length > 30 || !SLUG_RE.test(slug)) {
    return NextResponse.json({ available: false, invalid: true }, { status: 200 });
  }
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (admin as any)
    .from('courier_fleets')
    .select('id')
    .eq('slug', slug)
    .maybeSingle();
  return NextResponse.json({ available: !data }, { status: 200 });
}
