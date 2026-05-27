// Lane HIRforYOU-MARKETPLACE (2026-05-28) — /api/cont/sign-out
//
// Form-POST endpoint that ends the marketplace customer's Supabase
// session and redirects to /cont (which renders the sign-in view).

import { NextResponse, type NextRequest } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { assertSameOrigin } from '@/lib/origin-check';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const origin = assertSameOrigin(req);
  if (!origin.ok) {
    return NextResponse.json(
      { error: 'forbidden_origin', reason: origin.reason },
      { status: 403 },
    );
  }
  const supabase = getSupabase();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL('/cont', req.url), 303);
}
