import { NextResponse, type NextRequest } from 'next/server';
import { resolveTenantFromHost } from '@/lib/tenant';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { getStripe } from '@/lib/stripe/server';
import { assertSameOrigin } from '@/lib/origin-check';
import { intentRequestSchema } from '../schemas';
import { computeQuote } from '../pricing';
import { isAcceptingOrders, isOpenNow } from '@/lib/operations';
import { maybeSetCustomerCookie } from '@/lib/customer-recognition';
import { dispatchOrderEvent } from '@/lib/integration-bus';
import { checkLimit, clientIp } from '@/lib/rate-limit';
import { readCustomerCookie } from '@/lib/customer-recognition';
import { validateRedemption } from '@/lib/loyalty';
import { LOCALE_COOKIE, isLocale, DEFAULT_LOCALE } from '@/lib/i18n';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  // Each successful intent allocates a Stripe PaymentIntent + customer +
  // order rows. Without a limit, a script can burn thousands of cents in
  // Stripe object overhead. 10 attempts per IP per minute (capacity 10,
  // refill 1/6s) is generous for a real customer (typical checkout retries
  // 1-3 times) but blocks scripted abuse.
  const rl = checkLimit(`checkout-intent:${clientIp(req)}`, { capacity: 10, refillPerSec: 1 / 6 });
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'rate_limited' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    );
  }

  // Same-origin gate. Without this a third-party page could initiate a paid
  // order in a logged-in customer's browser via a cross-origin POST. The
  // attacker can't see the response (CORS blocks the read) but the side
  // effect — Stripe payment intent + a real order — is what we're stopping.
  const origin = assertSameOrigin(req);
  if (!origin.ok) {
    return NextResponse.json(
      { error: 'forbidden_origin', reason: origin.reason },
      { status: 403 },
    );
  }

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

  // Server-enforce cod_enabled (UI hides the radio when off).
  if (parsed.data.paymentMethod === 'COD') {
    const codEnabled = (tenant.settings as Record<string, unknown> | null)?.cod_enabled;
    if (codEnabled !== true) {
      return NextResponse.json({ error: 'cod_disabled' }, { status: 422 });
    }
  }

  const admin = getSupabaseAdmin();

  const quoted = await computeQuote(
    admin,
    { id: tenant.id, slug: tenant.slug, settings: tenant.settings },
    parsed.data.items,
    parsed.data.address ?? null,
    parsed.data.fulfillment,
    parsed.data.promoCode || null,
  );
  if (!quoted.ok) {
    return NextResponse.json({ error: 'quote_failed', reason: quoted.reason }, { status: 422 });
  }
  const q = quoted.quote;
  const isPickup = q.fulfillment === 'PICKUP';

  // Defense-in-depth: cart drawer hides the checkout CTA below min_order_ron,
  // but a determined client can still POST. Reject so we never charge a
  // customer for a sub-threshold cart.
  const tenantSettings = tenant.settings as Record<string, unknown> | null;
  const minOrderRon =
    typeof tenantSettings?.min_order_ron === 'number' && tenantSettings.min_order_ron > 0
      ? Number(tenantSettings.min_order_ron)
      : 0;
  if (minOrderRon > 0 && Number(q.subtotalRon) < minOrderRon) {
    return NextResponse.json(
      { error: 'below_min_order', min_order_ron: minOrderRon, subtotal_ron: q.subtotalRon },
      { status: 422 },
    );
  }

  // Loyalty redemption — applied AGAINST the cookie-recognized customer's
  // accumulated balance (each checkout creates a new customer row, but the
  // cookie persists their loyalty across visits). Validation only — the
  // atomic deduction (fn_loyalty_redeem) runs after the order row is
  // created so we have an order_id to log against.
  const requestedRedeemPoints = parsed.data.redeemPoints ?? 0;
  const recognizedCustomerId = readCustomerCookie(tenant.id);
  let loyaltyDiscountRon = 0;
  if (requestedRedeemPoints > 0) {
    if (!recognizedCustomerId) {
      // No prior cookie → no balance to redeem against.
      return NextResponse.json(
        { error: 'loyalty_no_account' },
        { status: 422 },
      );
    }
    const validation = await validateRedemption(
      tenant.id,
      recognizedCustomerId,
      requestedRedeemPoints,
      Number(q.totalRon),
    );
    if (!validation.ok) {
      return NextResponse.json(
        { error: 'loyalty_invalid', reason: validation.reason },
        { status: 422 },
      );
    }
    loyaltyDiscountRon = validation.discountRon;
  }

  const finalTotalRon = Number(
    Math.max(0, Number(q.totalRon) - loyaltyDiscountRon).toFixed(2),
  );
  const finalDiscountRon = Number(
    (Number(q.discountRon) + loyaltyDiscountRon).toFixed(2),
  );

  // Customer (one row per checkout — no auth/dedupe in MVP).
  // Persist the storefront locale so notify-customer-status emails ship in
  // the customer's chosen language. Default to RO when the cookie is unset.
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
    // SECURITY: don't echo DB error.message to public callers — leaks
    // constraint names, columns, and bound values. Log server-side.
    console.error('[checkout/intent] customer insert failed', custErr?.message);
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
      console.error('[checkout/intent] address insert failed', addrErr?.message);
      return NextResponse.json({ error: 'address_insert_failed' }, { status: 500 });
    }
    addressId = address.id;
  }

  // payment_method column ships in 20260504_001_orders_payment_method.sql
  // and the column has DEFAULT 'CARD'. We only set it explicitly when the
  // customer chose COD — that way the code deploy is decoupled from the
  // migration: pre-migration, CARD orders work (column omitted, no error);
  // post-migration, COD orders also work. The cast through `as never` keeps
  // typecheck green until supabase-types regenerates.
  const orderInsert: Record<string, unknown> = {
    tenant_id: tenant.id,
    customer_id: customer.id,
    delivery_address_id: addressId,
    items: q.lineItems,
    subtotal_ron: q.subtotalRon,
    delivery_fee_ron: q.deliveryFeeRon,
    total_ron: finalTotalRon,
    delivery_zone_id: q.zoneId,
    delivery_tier_id: q.tierId,
    notes: parsed.data.notes || null,
    status: 'PENDING',
    payment_status: 'UNPAID',
    promo_code_id: q.promo?.id ?? null,
    discount_ron: finalDiscountRon,
  };
  if (parsed.data.paymentMethod === 'COD') {
    orderInsert.payment_method = 'COD';
  }
  const { data: order, error: orderErr } = await admin
    .from('restaurant_orders')
    .insert(orderInsert as never)
    .select('id, public_track_token, total_ron')
    .single();
  if (orderErr || !order) {
    console.error('[checkout/intent] order insert failed', orderErr?.message);
    return NextResponse.json({ error: 'order_insert_failed' }, { status: 500 });
  }

  // RSHIR-33: atomic claim. The SQL function locks the promo row, refuses
  // when used_count >= max_uses, and is idempotent on order_id. If the
  // claim fails (race lost) we abort the order so we don't charge a
  // customer with a code they can't actually use.
  if (q.promo) {
    const { data: claimed, error: claimErr } = await admin.rpc('claim_promo_redemption', {
      p_promo_id: q.promo.id,
      p_order_id: order.id,
      p_customer_id: customer.id,
    });
    if (claimErr || claimed !== true) {
      await admin.from('restaurant_orders').delete().eq('id', order.id);
      return NextResponse.json(
        {
          error: 'quote_failed',
          reason: { kind: 'PROMO_INVALID', reason: 'usage_exhausted' },
        },
        { status: 422 },
      );
    }
  }

  // Loyalty redemption — atomic deduct via SECURITY DEFINER RPC. We
  // already validated in validateRedemption() above; this re-checks under
  // a row lock so a concurrent redemption can't double-spend the balance.
  // Returns NULL when balance is insufficient (race lost) — abort the
  // order so the customer isn't charged a discount they didn't get.
  if (loyaltyDiscountRon > 0 && recognizedCustomerId) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = admin as any;
    const { data: newBalance, error: redeemErr } = await sb.rpc('fn_loyalty_redeem', {
      p_tenant_id: tenant.id,
      p_customer_id: recognizedCustomerId,
      p_order_id: order.id,
      p_points: requestedRedeemPoints,
      p_note: 'redeemed at checkout',
    });
    if (redeemErr || newBalance === null) {
      console.error('[checkout/intent] loyalty redeem failed', redeemErr?.message);
      await admin.from('restaurant_orders').delete().eq('id', order.id);
      return NextResponse.json(
        { error: 'loyalty_invalid', reason: 'insufficient_balance' },
        { status: 422 },
      );
    }
  }

  // RSHIR-51: emit order.created onto the integration bus so any active
  // POS adapter for this tenant gets notified asynchronously. STANDALONE
  // tenants (no integration_providers row) short-circuit to a no-op,
  // so this adds zero latency for current pilots.
  await dispatchOrderEvent(tenant.id, 'created', {
    orderId: order.id,
    source: 'INTERNAL_STOREFRONT',
    status: 'PENDING',
    items: q.lineItems.map((li) => ({
      name: li.name,
      qty: li.quantity,
      priceRon: Number(li.priceRon),
      modifiers: li.modifiers.map((m) => m.name),
    })),
    totals: {
      subtotalRon: Number(q.subtotalRon),
      deliveryFeeRon: Number(q.deliveryFeeRon),
      totalRon: finalTotalRon,
    },
    customer: {
      firstName: parsed.data.customer.firstName,
      phone: parsed.data.customer.phone,
    },
    dropoff: parsed.data.address
      ? {
          line1: parsed.data.address.line1,
          city: parsed.data.address.city,
          lat: parsed.data.address.lat,
          lng: parsed.data.address.lng,
        }
      : null,
    notes: parsed.data.notes ?? null,
  });

  // The quote in the response reflects the FINAL totals — including any
  // loyalty discount applied above. Client uses these for the receipt UI.
  const responseQuote = {
    ...q,
    totalRon: finalTotalRon,
    discountRon: finalDiscountRon,
    loyaltyDiscountRon,
    redeemedPoints: loyaltyDiscountRon > 0 ? requestedRedeemPoints : 0,
  };

  // COD: skip Stripe entirely. Order is PENDING/UNPAID; the restaurant
  // collects cash on delivery and the admin marks payment_status PAID
  // post-delivery (manually or via the courier app's complete-order flow).
  // The customer skips the payment step on the client and lands on /track.
  if (parsed.data.paymentMethod === 'COD') {
    const res = NextResponse.json({
      orderId: order.id,
      publicTrackToken: order.public_track_token,
      paymentMethod: 'COD',
      quote: responseQuote,
    });
    maybeSetCustomerCookie(res, tenant.id, customer.id);
    return res;
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
    paymentMethod: 'CARD',
    clientSecret: intent.client_secret,
    quote: responseQuote,
  });
  // RSHIR-34: per-tenant "known device" hint pointing at customer.id.
  // Not authentication — just lets /account show this device's past orders.
  maybeSetCustomerCookie(res, tenant.id, customer.id);
  return res;
}
