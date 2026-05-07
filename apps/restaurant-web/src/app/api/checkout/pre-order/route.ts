// Pre-order intake — minimal slice (no payment intent, no courier dispatch).
//
// Pre-orders are advance bookings where the OWNER confirms by phone + arranges
// payment manually (cash on pickup, transfer, deposit, etc). This decouples
// the V1 lane from Stripe/COD branching and matches how cofetărie + catering
// pitches actually work in RO.
//
// Creates a single restaurant_orders row with:
//   - is_pre_order = true
//   - scheduled_for = customer-picked ISO timestamp
//   - status = 'PENDING'
//   - payment_status = 'UNPAID'
//
// OWNER moves the row through the standard status machine
// (PENDING -> CONFIRMED -> ... -> DELIVERED) from /dashboard/pre-orders.

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { resolveTenantFromHost } from '@/lib/tenant';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { assertSameOrigin } from '@/lib/origin-check';
import { cartItemSchema, addressSchema, customerSchema } from '../schemas';
import { computeQuote } from '../pricing';
import { readPreOrderSettings, checkScheduledForBounds } from '@/lib/pre-orders';
import { checkLimit, clientIp } from '@/lib/rate-limit';
import { LOCALE_COOKIE, isLocale, DEFAULT_LOCALE } from '@/lib/i18n';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const preOrderRequestSchema = z
  .object({
    items: z.array(cartItemSchema).min(1).max(50),
    fulfillment: z.enum(['DELIVERY', 'PICKUP']).default('PICKUP'),
    address: addressSchema.optional(),
    customer: customerSchema,
    notes: z.string().trim().max(500).optional().or(z.literal('')),
    scheduledFor: z.string().datetime(),
  })
  .refine((v) => v.fulfillment === 'PICKUP' || v.address !== undefined, {
    message: 'address required for delivery',
    path: ['address'],
  });

export async function POST(req: NextRequest) {
  // 5 attempts/min/IP — pre-orders are rarer than regular checkout, so we
  // tighten the bucket a little. A real customer fills the form once.
  const rl = checkLimit(`pre-order:${clientIp(req)}`, { capacity: 5, refillPerSec: 1 / 12 });
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'rate_limited' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    );
  }

  const origin = assertSameOrigin(req);
  if (!origin.ok) {
    return NextResponse.json(
      { error: 'forbidden_origin', reason: origin.reason },
      { status: 403 },
    );
  }

  const { tenant } = await resolveTenantFromHost();
  if (!tenant) return NextResponse.json({ error: 'tenant_not_found' }, { status: 404 });

  const settings = readPreOrderSettings(tenant.settings);
  if (!settings.enabled) {
    return NextResponse.json({ error: 'pre_orders_disabled' }, { status: 422 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = null;
  }
  const parsed = preOrderRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_request', issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const bounds = checkScheduledForBounds(parsed.data.scheduledFor, settings);
  if (!bounds.ok) {
    return NextResponse.json(
      { error: 'invalid_schedule', reason: bounds.reason },
      { status: 422 },
    );
  }

  const admin = getSupabaseAdmin();

  // Reuse the same quoting pipeline as regular checkout — pre-order pricing
  // (subtotal, delivery fee, zones) is identical; only the timing differs.
  // Promo codes intentionally NOT supported in V1: catering / advance orders
  // typically negotiate price by phone, and dragging the promo system into
  // pre-orders bloats the lane.
  const quoted = await computeQuote(
    admin,
    { id: tenant.id, slug: tenant.slug, settings: tenant.settings },
    parsed.data.items,
    parsed.data.address ?? null,
    parsed.data.fulfillment,
    null,
  );
  if (!quoted.ok) {
    return NextResponse.json({ error: 'quote_failed', reason: quoted.reason }, { status: 422 });
  }
  const q = quoted.quote;
  const isPickup = q.fulfillment === 'PICKUP';

  if (settings.min_subtotal_ron > 0 && Number(q.subtotalRon) < settings.min_subtotal_ron) {
    return NextResponse.json(
      {
        error: 'below_min_subtotal',
        min_subtotal_ron: settings.min_subtotal_ron,
        subtotal_ron: q.subtotalRon,
      },
      { status: 422 },
    );
  }

  const localeCookie = req.cookies.get(LOCALE_COOKIE)?.value;
  const customerLocale = isLocale(localeCookie) ? localeCookie : DEFAULT_LOCALE;
  const { data: customer, error: custErr } = await admin
    .from('customers')
    .insert({
      tenant_id: tenant.id,
      first_name: parsed.data.customer.firstName,
      last_name: parsed.data.customer.lastName,
      phone: parsed.data.customer.phone,
      email: parsed.data.customer.email || null,
      locale: customerLocale,
    } as never)
    .select('id')
    .single();
  if (custErr || !customer) {
    console.error('[pre-order] customer insert failed', custErr?.message);
    return NextResponse.json({ error: 'customer_insert_failed' }, { status: 500 });
  }

  let addressId: string | null = null;
  if (!isPickup && parsed.data.address) {
    const { data: address, error: addrErr } = await admin
      .from('customer_addresses')
      .insert({
        customer_id: customer.id,
        line1: parsed.data.address.line1,
        line2: parsed.data.address.line2 || null,
        city: parsed.data.address.city,
        postal_code: parsed.data.address.postalCode || null,
        latitude: parsed.data.address.lat,
        longitude: parsed.data.address.lng,
      })
      .select('id')
      .single();
    if (addrErr || !address) {
      console.error('[pre-order] address insert failed', addrErr?.message);
      return NextResponse.json({ error: 'address_insert_failed' }, { status: 500 });
    }
    addressId = address.id;
  }

  // The is_pre_order + scheduled_for columns ship in 20260609_001_pre_orders.sql.
  // supabase-types regenerates post-merge so we cast through `as never`, same
  // pattern the rest of the codebase uses for not-yet-typed columns.
  const orderInsert: Record<string, unknown> = {
    tenant_id: tenant.id,
    customer_id: customer.id,
    delivery_address_id: addressId,
    items: q.lineItems,
    subtotal_ron: q.subtotalRon,
    delivery_fee_ron: q.deliveryFeeRon,
    total_ron: q.totalRon,
    delivery_zone_id: q.zoneId,
    delivery_tier_id: q.tierId,
    notes: parsed.data.notes || null,
    status: 'PENDING',
    payment_status: 'UNPAID',
    is_pre_order: true,
    scheduled_for: parsed.data.scheduledFor,
  };

  const { data: order, error: orderErr } = await admin
    .from('restaurant_orders')
    .insert(orderInsert as never)
    .select('id, public_track_token')
    .single();
  if (orderErr || !order) {
    console.error('[pre-order] order insert failed', orderErr?.message);
    return NextResponse.json({ error: 'order_insert_failed' }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    orderId: order.id,
    trackToken: order.public_track_token,
  });
}
