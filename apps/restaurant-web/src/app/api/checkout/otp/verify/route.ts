// POST /api/checkout/otp/verify
//
// Closes the OTP loop: client submits the 6-digit code, we look up the
// newest active row for the phone, compare hashes, and stamp verified_at.
//
// Rate-limit: 5 attempts per phone (capacity 5, refill 1 / 30min). After
// that the active row is treated as exhausted and the customer must call
// /request again. We also enforce an IP cap (10 / 15 min) to slow down
// distributed enumeration.
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { assertSameOrigin } from '@/lib/origin-check';
import { checkLimit, clientIp } from '@/lib/rate-limit';
import {
  hashOtpCode,
  normalizeRoPhoneE164,
  OTP_MAX_ATTEMPTS,
} from '@/lib/checkout/otp';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  phone: z.string().min(6).max(40),
  code: z.string().regex(/^\d{6}$/),
});

export async function POST(req: NextRequest) {
  const origin = assertSameOrigin(req);
  if (!origin.ok) {
    return NextResponse.json({ error: 'forbidden_origin' }, { status: 403 });
  }

  const ipKey = `otp-verify-ip:${clientIp(req)}`;
  const ipRl = checkLimit(ipKey, { capacity: 10, refillPerSec: 10 / 900 });
  if (!ipRl.ok) {
    return NextResponse.json(
      { error: 'rate_limited' },
      { status: 429, headers: { 'Retry-After': String(ipRl.retryAfterSec) } },
    );
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    raw = null;
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }
  const phoneE164 = normalizeRoPhoneE164(parsed.data.phone);
  if (!phoneE164) {
    return NextResponse.json({ error: 'invalid_phone' }, { status: 422 });
  }

  const admin = getSupabaseAdmin();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any;
  const { data: row, error: readErr } = await sb
    .from('customer_phone_verifications')
    .select('id, code_hash, expires_at, attempts, verified_at')
    .eq('phone', phoneE164)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (readErr) {
    console.error('[otp/verify] read failed', readErr.message);
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ error: 'no_active_code' }, { status: 404 });
  }

  if (new Date(row.expires_at).getTime() <= Date.now()) {
    return NextResponse.json({ error: 'expired' }, { status: 410 });
  }
  if ((row.attempts ?? 0) >= OTP_MAX_ATTEMPTS) {
    return NextResponse.json({ error: 'attempts_exhausted' }, { status: 429 });
  }

  const candidateHash = hashOtpCode(parsed.data.code);
  if (candidateHash !== row.code_hash) {
    await sb
      .from('customer_phone_verifications')
      .update({ attempts: (row.attempts ?? 0) + 1 })
      .eq('id', row.id);
    return NextResponse.json({ error: 'invalid_code' }, { status: 422 });
  }

  // Match. Stamp verified_at (idempotent — re-verify of the same code is
  // a no-op). The checkout/intent route enforces this server-side:
  // when tenant.settings.checkout.otp_enabled = true it refuses orders
  // where no verified row exists within the last 30 minutes.
  const verifiedAt = new Date().toISOString();
  const { error: updErr } = await sb
    .from('customer_phone_verifications')
    .update({ verified_at: verifiedAt })
    .eq('id', row.id);
  if (updErr) {
    console.error('[otp/verify] mark verified failed', updErr.message);
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }
  return NextResponse.json({ ok: true, phone: phoneE164, verifiedAt });
}
