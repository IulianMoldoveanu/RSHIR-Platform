// Lane HIRforYOU-MARKETPLACE (2026-05-28) — POST /api/marketplace/reviews
//
// Customer submits a 1-5 star rating + optional comment for a marketplace
// order. Auth is required (Supabase session cookie); we look up the
// marketplace_customer by auth_user_id and enforce the (tenant, customer,
// order) unique constraint at the DB level.
//
// Public read of reviews is handled directly via the marketplace_directory
// page server components — no GET endpoint needed.

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getSupabase } from '@/lib/supabase';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { assertSameOrigin } from '@/lib/origin-check';
import { checkLimit, clientIp } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  tenantId: z.string().uuid(),
  orderId: z.string().uuid().optional().nullable(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(2000).optional().nullable(),
});

export async function POST(req: NextRequest) {
  // Per-IP limit — 10/hour so a single customer cannot spam the reviews
  // table even if they cycle through orders.
  const ip = clientIp(req);
  const ipRl = checkLimit(`mp-review-ip:${ip}`, { capacity: 10, refillPerSec: 10 / 3600 });
  if (!ipRl.ok) {
    return NextResponse.json(
      { error: 'rate_limited' },
      { status: 429, headers: { 'Retry-After': String(ipRl.retryAfterSec) } },
    );
  }

  const origin = assertSameOrigin(req);
  if (!origin.ok) {
    return NextResponse.json(
      { error: 'forbidden_origin', reason: origin.reason },
      { status: 403 },
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
  const { tenantId, orderId, rating, comment } = parsed.data;

  // Resolve the calling user. We accept ONLY logged-in customers — guest
  // reviews would require a token-based flow (followup).
  const supabase = getSupabase();
  const { data: userResp, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userResp?.user) {
    return NextResponse.json({ error: 'auth_required' }, { status: 401 });
  }
  const authUserId = userResp.user.id;

  const admin = getSupabaseAdmin();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb: any = admin;

  // 1. Lookup marketplace_customer by auth_user_id. Customers always get
  //    bound to their auth user on first login; this query is the cheap
  //    path. If the row is missing, we 404 — the customer must place at
  //    least one order before reviewing.
  const { data: customerRow, error: customerErr } = await sb
    .from('marketplace_customers')
    .select('id')
    .eq('auth_user_id', authUserId)
    .maybeSingle();
  if (customerErr) {
    return NextResponse.json({ error: 'customer_lookup_failed' }, { status: 500 });
  }
  if (!customerRow) {
    return NextResponse.json({ error: 'no_customer_record' }, { status: 404 });
  }

  // 2. If orderId is provided, verify (a) the order belongs to the same
  //    marketplace customer (no impersonation) and (b) the order is at
  //    tenantId. Belt-and-suspenders on top of the DB unique constraint.
  if (orderId) {
    const { data: order, error: orderErr } = await sb
      .from('restaurant_orders')
      .select('id, tenant_id, marketplace_customer_id, status')
      .eq('id', orderId)
      .maybeSingle();
    if (orderErr) {
      return NextResponse.json({ error: 'order_lookup_failed' }, { status: 500 });
    }
    if (!order) {
      return NextResponse.json({ error: 'order_not_found' }, { status: 404 });
    }
    if (order.tenant_id !== tenantId) {
      return NextResponse.json({ error: 'order_tenant_mismatch' }, { status: 400 });
    }
    if (order.marketplace_customer_id !== customerRow.id) {
      return NextResponse.json({ error: 'order_not_yours' }, { status: 403 });
    }
    // Only reviews on DELIVERED orders count. Discourages drive-by ratings
    // for cancelled/rejected orders.
    if (order.status !== 'DELIVERED') {
      return NextResponse.json({ error: 'order_not_delivered' }, { status: 409 });
    }
  }

  // 3. Insert. The UNIQUE (tenant_id, marketplace_customer_id, order_id)
  //    constraint will reject double-submissions atomically.
  const { error: insertErr } = await sb.from('marketplace_reviews').insert({
    tenant_id: tenantId,
    marketplace_customer_id: customerRow.id,
    order_id: orderId ?? null,
    rating,
    comment: comment ?? null,
  });
  if (insertErr) {
    // 23505 = unique_violation. Distinguish from other 5xxs so the client
    // can show "already reviewed" copy instead of a generic error.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((insertErr as any).code === '23505') {
      return NextResponse.json({ error: 'already_reviewed' }, { status: 409 });
    }
    return NextResponse.json({ error: 'insert_failed' }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
