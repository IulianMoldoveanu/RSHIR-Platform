// Lane HIRforYOU-MARKETPLACE (2026-05-28) — /api/cont/sign-in
//
// Sends a magic link to the marketplace customer's email via Supabase
// auth. Form-encoded so the /cont page works without JS. On success we
// redirect back to /cont with ?check=email; on failure we redirect with
// ?error=…
//
// The link target is the same /cont page — Supabase auth-helpers handles
// the session cookie exchange via /auth/callback.

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getSupabase } from '@/lib/supabase';
import { checkLimit, clientIp } from '@/lib/rate-limit';
import { assertSameOrigin } from '@/lib/origin-check';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  email: z.string().trim().email().max(200),
});

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  // 5 attempts per hour per IP — same shape as the magic-link account flow
  // for the storefront so we have a single rate-limit posture across
  // password-less surfaces.
  const ipRl = checkLimit(`cont-signin-ip:${ip}`, { capacity: 5, refillPerSec: 5 / 3600 });
  if (!ipRl.ok) {
    return NextResponse.redirect(
      new URL('/cont?error=rate_limited', req.url),
      303,
    );
  }

  const origin = assertSameOrigin(req);
  if (!origin.ok) {
    return NextResponse.json(
      { error: 'forbidden_origin', reason: origin.reason },
      { status: 403 },
    );
  }

  let email: string;
  const ct = req.headers.get('content-type') ?? '';
  if (ct.includes('application/json')) {
    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      raw = null;
    }
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.redirect(new URL('/cont?error=invalid_email', req.url), 303);
    }
    email = parsed.data.email;
  } else {
    const form = await req.formData();
    const parsed = bodySchema.safeParse({ email: form.get('email') ?? '' });
    if (!parsed.success) {
      return NextResponse.redirect(new URL('/cont?error=invalid_email', req.url), 303);
    }
    email = parsed.data.email;
  }

  const supabase = getSupabase();
  const redirectTo = new URL('/cont', req.url).toString();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectTo },
  });
  if (error) {
    // Don't leak Supabase error specifics to the client; log and redirect.
    console.error('[marketplace sign-in] otp dispatch failed', error.message);
    return NextResponse.redirect(new URL('/cont?error=send_failed', req.url), 303);
  }

  return NextResponse.redirect(new URL('/cont?check=email', req.url), 303);
}
