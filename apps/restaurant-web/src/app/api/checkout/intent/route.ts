import { NextResponse } from 'next/server';
import { resolveTenantFromHost } from '@/lib/tenant';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { getStripe } from '@/lib/stripe/server';
import { intentRequestSchema } from '../schemas';
import { computeQuote } from '../pricing';
import { isAcceptingOrders, isOpenNow } from '@/lib/operations';
import { maybeSetCustomerCookie } from '@/lib/customer-recognition';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const { tenant } = await resolveTenantFromHost();
  if (!tenant) return NextResponse.json({ error: 'tenant_not_found' }, { status: 404 });

  const accepting = isAcceptingOrders(tenant.settings);
  const openStatus = isOpenNow(tenant.settings);
  if (!accepting || !openStatus.open) {
    return NextResponse.json(
      {
        error: 'closed',
        nextOpen: openStatus.nextOpen?.toISOString(),
      },
      { status: 503 },
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = intentRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_request', issues: parsed.error.flatten() }, { status: 400 });
  }

  // RSHIR-32 M-2: server-enforce pickup_enabled (UI gate is not enough).
  if (parsed.data.fulfillment === 'PICKUP') {
    const pickupEnabled = (tenant.settings as Record<string, unknown> | null)?.pickup_enabled;
    if (pickupEnabled === false) {
      return NextResponse.json({ error: 'pickup_disabled' }, { status: 422 });
    }
  }

  const admin = getSupabaseAdmin();

  const quoted = await computeQuote(
    admin,
    { id: tenant.id, slug: tenant.slug, settings: tenant.settings },
    parsed.data.items,
    parsed.data.address ?? null,
    parsed.data.fulfillment,
  );
  if (!quoted.ok) {
    return NextResponse.json({ error: 'quote_failed', reason: quoted.reason }, { status: 422 });
  }
  const q = quoted.quote;
  const isPickup = q.fulfillment === 'PICKUP';

  // Customer (one row per checkout — no auth/dedupe in MVP).
  const { data: customer, error: custErr } = await admin
    .from('customers')
    .insert({
      tenant_id: tenant.id,
      first_name: parsed.data.customer.firstName,
      last_name: parsed.data.customer.lastName,
      phone: parsed.data.customer.phone,
      email: parsed.data.customer.email || null,
    })
    .select('id')
    .single();
  if (custErr || !customer) {
    return NextResponse.json({ error: 'customer_insert_failed', detail: custErr?.message }, { status: 500 });
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
      return NextResponse.json({ error: 'address_insert_failed', detail: addrErr?.message }, { status: 500 });
    }
    addressId = address.id;
  }

  const { data: order, error: orderErr } = await admin
    .from('restaurant_orders')
    .insert({
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
    })
    .select('id, public_track_token, total_ron')
    .single();
  if (orderErr || !order) {
    return NextResponse.json({ error: 'order_insert_failed', detail: orderErr?.message }, { status: 500 });
  }

  const stripe = getStripe();
  const intent = await stripe.paymentIntents.create(
    {
      amount: Math.round(Number(order.total_ron) * 100),
      currency: 'ron',
      automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
      metadata: {
        order_id: order.id,
        tenant_id: tenant.id,
        tenant_slug: tenant.slug,
      },
    },
    { idempotencyKey: `order:${order.id}` },
  );

  await admin
    .from('restaurant_orders')
    .update({ stripe_payment_intent_id: intent.id })
    .eq('id', order.id);

  const res = NextResponse.json({
    orderId: order.id,
    publicTrackToken: order.public_track_token,
    clientSecret: intent.client_secret,
    quote: q,
  });
  // RSHIR-34: per-tenant "known device" hint pointing at customer.id.
  // Not authentication — just lets /account show this device's past orders.
  maybeSetCustomerCookie(res, tenant.id, customer.id);
  return res;
}
