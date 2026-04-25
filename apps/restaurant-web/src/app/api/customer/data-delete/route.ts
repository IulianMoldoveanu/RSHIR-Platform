import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { assertSameOrigin } from '@/lib/origin-check';
import { checkLimit, clientIp } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  public_track_token: z.string().uuid(),
  email_or_phone: z.string().min(3).max(120),
});

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

export async function POST(req: NextRequest) {
  // RSHIR-31 H-1: origin check + per-IP rate limit. Redaction is irreversible;
  // an attacker with one screenshot of a tracking link should not be able to
  // mass-delete customer records.
  const origin = assertSameOrigin(req);
  if (!origin.ok) {
    return NextResponse.json({ error: 'forbidden_origin', reason: origin.reason }, { status: 403 });
  }
  // 3 deletes per IP per hour: capacity 3, refill ~1/1200s.
  const rl = checkLimit(`dsr-delete:${clientIp(req)}`, { capacity: 3, refillPerSec: 1 / 1200 });
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'rate_limited' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    );
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const admin = getSupabaseAdmin();

  const { data: order, error } = await admin
    .from('restaurant_orders')
    .select('id, customer_id, public_track_token')
    .eq('public_track_token', parsed.data.public_track_token)
    .maybeSingle();

  if (error || !order || !order.customer_id) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const { data: customer } = await admin
    .from('customers')
    .select('id, email, phone, deleted_at')
    .eq('id', order.customer_id)
    .maybeSingle();

  if (!customer) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const provided = normalize(parsed.data.email_or_phone);
  const customerEmail = customer.email ? normalize(customer.email) : null;
  const customerPhone = customer.phone ? normalize(customer.phone) : null;
  if (provided !== customerEmail && provided !== customerPhone) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const { error: rpcError } = await admin.rpc('gdpr_redact_customer', {
    p_customer_id: customer.id,
  });
  if (rpcError) {
    return NextResponse.json({ error: 'redaction_failed' }, { status: 500 });
  }

  return NextResponse.json({ deleted: true, customer_id: customer.id });
}
