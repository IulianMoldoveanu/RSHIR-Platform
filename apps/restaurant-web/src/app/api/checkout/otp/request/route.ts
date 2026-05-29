// POST /api/checkout/otp/request
//
// Generates a 6-digit OTP for the supplied RO phone, stores a salted SHA-256
// hash (TTL 5 min), and texts the code to the phone via Twilio.
//
// P0 audit #5 — without this, anyone can flood arbitrary phones with COD
// orders against an RSHIR tenant.
//
// Rate-limit: 3 sends per phone per 10 min (capacity 3, refill 1 / 200s) plus
// the route's IP gate (5 / hour). Twilio is billed per send; both caps
// matter.
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { resolveTenantFromHost } from '@/lib/tenant';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { assertSameOrigin } from '@/lib/origin-check';
import { checkLimit, clientIp } from '@/lib/rate-limit';
import {
  devEchoEnabled,
  generateOtpCode,
  hashOtpCode,
  normalizeRoPhoneE164,
  OTP_TTL_SECONDS,
  sendOtpSms,
} from '@/lib/checkout/otp';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  phone: z.string().min(6).max(40),
});

export async function POST(req: NextRequest) {
  const origin = assertSameOrigin(req);
  if (!origin.ok) {
    return NextResponse.json({ error: 'forbidden_origin' }, { status: 403 });
  }
  const { tenant } = await resolveTenantFromHost();
  if (!tenant) return NextResponse.json({ error: 'tenant_not_found' }, { status: 404 });

  // IP gate first — a script flooding /request from one machine should be
  // blocked before we touch the DB or Twilio.
  const ipKey = `otp-request-ip:${clientIp(req)}`;
  const ipRl = checkLimit(ipKey, { capacity: 5, refillPerSec: 5 / 3600 });
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

  // Per-phone gate. Stops an attacker from rotating IPs to harass one
  // number with repeated SMS — 3 sends per 10min is what banks use.
  const phoneRl = checkLimit(`otp-request-phone:${phoneE164}`, {
    capacity: 3,
    refillPerSec: 1 / 200,
  });
  if (!phoneRl.ok) {
    return NextResponse.json(
      { error: 'rate_limited_phone' },
      { status: 429, headers: { 'Retry-After': String(phoneRl.retryAfterSec) } },
    );
  }

  const code = generateOtpCode();
  const codeHash = hashOtpCode(code);
  const expiresAt = new Date(Date.now() + OTP_TTL_SECONDS * 1000).toISOString();
  const admin = getSupabaseAdmin();

  // Upsert via delete-then-insert under the unique partial index pattern.
  // The unique index is `(phone) WHERE expires_at > now()`, so we
  // explicitly expire any active row for this phone first. This keeps the
  // active row count at most 1 per phone — the verify route picks the
  // newest by created_at desc.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any;
  const { error: clearErr } = await sb
    .from('customer_phone_verifications')
    .update({ expires_at: new Date(0).toISOString() })
    .eq('phone', phoneE164)
    .gt('expires_at', new Date().toISOString());
  if (clearErr) {
    console.error('[otp/request] clear stale failed', clearErr.message);
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }
  const { error: insertErr } = await sb
    .from('customer_phone_verifications')
    .insert({
      phone: phoneE164,
      code_hash: codeHash,
      expires_at: expiresAt,
    });
  if (insertErr) {
    console.error('[otp/request] insert failed', insertErr.message);
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }

  const sendResult = await sendOtpSms(phoneE164, code);
  if (!sendResult.ok) {
    if (sendResult.reason === 'not_configured') {
      // Dev override: surface the code in the response so the storefront
      // happy-path is testable without Twilio creds. NEVER ship with
      // RSHIR_OTP_DEV_ECHO=1 in prod — equivalent to no OTP at all.
      if (devEchoEnabled()) {
        return NextResponse.json({
          ok: true,
          devMode: true,
          devCode: code,
          phone: phoneE164,
          expiresInSec: OTP_TTL_SECONDS,
        });
      }
      // Tenant marketing wants OTP enabled but ops hasn't wired Twilio
      // creds yet — clear 503 with operator-friendly detail.
      return NextResponse.json(
        { error: 'sms_provider_unavailable', detail: 'OTP SMS provider not configured' },
        { status: 503 },
      );
    }
    console.error('[otp/request] sms send failed', sendResult.status, sendResult.detail);
    return NextResponse.json({ error: 'sms_send_failed' }, { status: 502 });
  }

  // We DO NOT return the code on success — the client only learns the OTP
  // through SMS. tenantId is echoed to make UI scoping unambiguous.
  return NextResponse.json({
    ok: true,
    phone: phoneE164,
    tenantId: tenant.id,
    expiresInSec: OTP_TTL_SECONDS,
  });
}
