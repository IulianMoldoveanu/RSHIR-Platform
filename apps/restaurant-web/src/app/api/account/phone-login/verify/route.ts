// POST /api/account/phone-login/verify
//
// Phone+OTP login. Reuses the existing OTP infrastructure — the code was
// already requested via POST /api/checkout/otp/request (same endpoint the
// checkout phone-verification step uses; it's tenant-agnostic, keyed only
// on phone). This route is the difference: on a correct code, it resolves
// (or, if the phone never ordered here, does NOT create) a customer row
// for this tenant + phone and sets the SAME recognition cookie the rest of
// the storefront already reads (checkout prefill, loyalty, /account).
//
// This does not gate checkout — guest checkout is untouched. It only lets
// a returning customer voluntarily "log in" on a device where the cookie
// was cleared / never set, to see their order history on /account.
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { resolveTenantFromHost } from '@/lib/tenant';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { assertSameOrigin } from '@/lib/origin-check';
import { checkLimit, clientIp } from '@/lib/rate-limit';
import { hashOtpCode, normalizeRoPhoneE164, OTP_MAX_ATTEMPTS } from '@/lib/checkout/otp';
import { maybeSetCustomerCookie } from '@/lib/customer-recognition';

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

  const { tenant } = await resolveTenantFromHost();
  if (!tenant) return NextResponse.json({ error: 'tenant_not_found' }, { status: 404 });

  const ipRl = checkLimit(`phone-login-verify-ip:${clientIp(req)}`, {
    capacity: 10,
    refillPerSec: 10 / 900,
  });
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
    .select('id, code_hash, expires_at, attempts')
    .eq('phone', phoneE164)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (readErr) {
    console.error('[phone-login/verify] read failed', readErr.message);
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

  // Correct code. Expire it (single-use for login, same as checkout verify)
  // then resolve the customer row for this tenant + phone. We do NOT
  // create an account here — logging in only makes sense for a phone that
  // has already ordered (has a customers row via the checkout upsert-by-
  // phone path). A never-ordered phone has nothing to log into.
  await sb
    .from('customer_phone_verifications')
    .update({ verified_at: new Date().toISOString(), expires_at: new Date(0).toISOString() })
    .eq('id', row.id);

  const { data: customer } = await sb
    .from('customers')
    .select('id')
    .eq('tenant_id', tenant.id)
    .eq('phone', phoneE164)
    .maybeSingle();
  if (!customer) {
    return NextResponse.json({ error: 'no_account_for_phone' }, { status: 404 });
  }

  const res = NextResponse.json({ ok: true });
  maybeSetCustomerCookie(res, tenant.id, customer.id);
  return res;
}
