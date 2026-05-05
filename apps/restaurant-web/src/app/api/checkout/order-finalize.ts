import 'server-only';
import {
  createHirDeliveryClient,
  type CreateDeliveryOrderInput,
  type DeliveryOrderItem,
} from '@hir/delivery-client';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { dispatchOrderEvent } from '@/lib/integration-bus';

/**
 * Idempotent: marks a paid order as CONFIRMED and (when the env is wired)
 * dispatches it to the courier app. Safe to call multiple times — the
 * Stripe webhook + the /confirm route race on the same order.
 *
 * Card flow: this is called after payment_intent.succeeded.
 * COD flow: this is NOT called automatically — the order stays PENDING/UNPAID
 * until the admin marks it paid post-delivery (separate action).
 */
export async function markOrderPaidAndDispatch(orderId: string): Promise<void> {
  const admin = getSupabaseAdmin();

  const { data: existing } = await admin
    .from('restaurant_orders')
    .select('id, payment_status, status')
    .eq('id', orderId)
    .single();
  if (!existing) return;
  if (existing.payment_status === 'PAID' && existing.status !== 'PENDING') {
    return; // already finalized
  }

  // Atomic guard: the Stripe webhook and the client-driven /confirm both call
  // this function and can race within ~100ms of each other on the happy path.
  // Without the payment_status filter both threads would (a) flip the order
  // PAID twice — harmless — and (b) BOTH proceed past this point and call
  // dispatchOrderEvent + dispatchToCourier, producing duplicate courier-side
  // orders. The filter ensures only the first writer continues; the second
  // sees zero affected rows and returns.
  const { data: claimed, error: updErr } = await admin
    .from('restaurant_orders')
    .update({ payment_status: 'PAID', status: 'CONFIRMED' })
    .eq('id', orderId)
    .eq('payment_status', 'UNPAID')
    .select('id');
  if (updErr) throw new Error(updErr.message);
  if (!claimed || claimed.length === 0) {
    // Another thread already claimed this order — they will dispatch.
    return;
  }

  // Hydrate the full order for downstream dispatch + integration bus. Single
  // round-trip with relational shorthand.
  const { data: full } = await admin
    .from('restaurant_orders')
    .select(
      `
        id, tenant_id, items, subtotal_ron, delivery_fee_ron, total_ron, notes,
        delivery_address_id,
        tenants ( slug, settings ),
        customers ( first_name, last_name, phone, email ),
        customer_addresses ( line1, line2, city, postal_code, latitude, longitude )
      `,
    )
    .eq('id', orderId)
    .single();

  if (!full?.tenant_id) return;

  // Integration bus: every active POS adapter for this tenant gets
  // notified of the payment landing. STANDALONE tenants are a no-op.
  await dispatchOrderEvent(full.tenant_id, 'status_changed', {
    orderId,
    source: 'INTERNAL_STOREFRONT',
    status: 'CONFIRMED',
    items: [],
    totals: { subtotalRon: 0, deliveryFeeRon: 0, totalRon: 0 },
    customer: { firstName: '', phone: '' },
    dropoff: null,
    notes: null,
  });

  await dispatchToCourier(orderId, full);
}

type FullOrder = {
  id: string;
  tenant_id: string;
  items: unknown;
  subtotal_ron: number | string;
  delivery_fee_ron: number | string;
  total_ron: number | string;
  notes: string | null;
  delivery_address_id: string | null;
  tenants: { slug: string; settings: unknown } | null;
  customers: {
    first_name: string | null;
    last_name: string | null;
    phone: string | null;
    email: string | null;
  } | null;
  customer_addresses: {
    line1: string | null;
    line2: string | null;
    city: string | null;
    postal_code: string | null;
    latitude: number | null;
    longitude: number | null;
  } | null;
};

async function dispatchToCourier(orderId: string, full: FullOrder): Promise<void> {
  const baseUrl = process.env.COURIER_API_BASE_URL ?? process.env.HIR_DELIVERY_API_BASE_URL;
  const apiKey = process.env.COURIER_API_KEY ?? process.env.HIR_DELIVERY_API_KEY;
  if (!baseUrl || !apiKey) {
    // Courier integration not configured — order stays in HIR with status
    // CONFIRMED for the restaurant to handle manually. Not an error.
    return;
  }
  // Pickup is a tenant property — derived from the tenant's location
  // settings. Skip dispatch when location isn't set; the restaurant
  // hasn't configured pickup coords and the courier wouldn't know where
  // to fetch from.
  // Read pickup coords + address from BOTH shapes that ship in production:
  // flat keys (admin Operations save) and nested object (onboarding wizard).
  // See tenantLocationFromSettings for the same dual-shape rationale.
  const tenantSettings = (full.tenants?.settings ?? {}) as Record<string, unknown>;
  const nestedLoc =
    tenantSettings.location && typeof tenantSettings.location === 'object'
      ? (tenantSettings.location as Record<string, unknown>)
      : {};
  const pickupLat =
    typeof tenantSettings.location_lat === 'number'
      ? tenantSettings.location_lat
      : typeof nestedLoc.lat === 'number'
        ? nestedLoc.lat
        : null;
  const pickupLng =
    typeof tenantSettings.location_lng === 'number'
      ? tenantSettings.location_lng
      : typeof nestedLoc.lng === 'number'
        ? nestedLoc.lng
        : null;
  const pickupAddr =
    typeof tenantSettings.pickup_address === 'string' && tenantSettings.pickup_address.length > 0
      ? tenantSettings.pickup_address
      : typeof nestedLoc.formatted === 'string' && nestedLoc.formatted.length > 0
        ? (nestedLoc.formatted as string)
        : typeof tenantSettings.physical_address === 'string'
          ? (tenantSettings.physical_address as string)
          : null;
  const pickupCity =
    typeof tenantSettings.location_city === 'string' ? tenantSettings.location_city : '';
  if (pickupLat === null || pickupLng === null || !pickupAddr) {
    console.warn('[courier-dispatch] tenant has no pickup coords; skipping', { tenantId: full.tenant_id });
    return;
  }
  // No dropoff = pickup-by-customer, courier not needed.
  if (!full.delivery_address_id || !full.customer_addresses) return;

  const items: DeliveryOrderItem[] = Array.isArray(full.items)
    ? (full.items as Array<{ name?: string; quantity?: number; priceRon?: number; notes?: string }>).map((li) => ({
        name: li.name ?? 'item',
        quantity: Number(li.quantity ?? 1),
        unitPriceRon: Number(li.priceRon ?? 0),
        notes: li.notes,
      }))
    : [];

  const payload: CreateDeliveryOrderInput = {
    externalOrderId: orderId,
    customer: {
      firstName: full.customers?.first_name ?? '',
      lastName: full.customers?.last_name ?? '',
      phone: full.customers?.phone ?? '',
      email: full.customers?.email ?? undefined,
    },
    pickupAddress: {
      line1: pickupAddr,
      city: pickupCity || 'Brașov',
      country: 'RO',
      latitude: pickupLat,
      longitude: pickupLng,
    },
    dropoffAddress: {
      line1: [full.customer_addresses.line1, full.customer_addresses.line2]
        .filter(Boolean)
        .join(', '),
      city: full.customer_addresses.city ?? '',
      postalCode: full.customer_addresses.postal_code ?? undefined,
      country: 'RO',
      latitude: Number(full.customer_addresses.latitude ?? 0),
      longitude: Number(full.customer_addresses.longitude ?? 0),
    },
    items,
    totalRon: Number(full.total_ron ?? 0),
    deliveryFeeRon: Number(full.delivery_fee_ron ?? 0),
    notes: full.notes ?? undefined,
  };

  try {
    const client = createHirDeliveryClient({ baseUrl, apiKey });
    await client.createOrder(payload);
  } catch (err) {
    // Best-effort: a failed handoff doesn't roll back the customer's payment.
    // The order stays CONFIRMED; the restaurant sees it in admin and can call
    // the customer manually if needed. Future: persist the failure into a
    // delivery_dispatch_attempts table for retry/visibility.
    console.warn(
      '[courier-dispatch] handoff failed:',
      (err as Error).message?.slice(0, 300),
    );
  }
}

export async function markOrderPaymentFailed(orderId: string): Promise<void> {
  const admin = getSupabaseAdmin();
  await admin
    .from('restaurant_orders')
    .update({ payment_status: 'FAILED' })
    .eq('id', orderId);
}

/**
 * Lane G + payment-lifecycle: charge.refunded webhook. Looks up the order by
 * Stripe PaymentIntent id (set when the intent was created in
 * /api/checkout/intent) and flips payment_status to REFUNDED. Also stamps
 * refunded_at + refund_amount_bani + refund_reason from the charge payload
 * for visibility in admin UIs (PR 3+).
 *
 * Does NOT auto-cancel the order — the restaurant admin reviews refunded
 * orders manually before deciding whether to cancel courier dispatch (the
 * food may already be in transit).
 *
 * Idempotent: re-running on an already-REFUNDED order overwrites the same
 * columns with the same values (Stripe replays carry the same charge id).
 *
 * Audit log: emitted only when the row actually flips (UNPAID/PAID →
 * REFUNDED), to avoid duplicate entries on Stripe retries.
 */
export async function markOrderRefunded(
  stripePaymentIntentId: string,
  meta?: { amountBani: number | null; reason: string | null },
): Promise<void> {
  const admin = getSupabaseAdmin();
  // The new lifecycle columns ship in 20260606_003 — supabase-types regenerates
  // post-merge so we cast through `any` here, same pattern as the webhook
  // route's stripe_events_processed handling.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adminAny = admin as any;

  // Read first so we can detect the transition and capture tenant_id for
  // the audit log entry.
  const { data: existing } = await adminAny
    .from('restaurant_orders')
    .select('id, tenant_id, payment_status')
    .eq('stripe_payment_intent_id', stripePaymentIntentId)
    .single();
  if (!existing) return;

  const wasAlreadyRefunded = existing.payment_status === 'REFUNDED';

  await adminAny
    .from('restaurant_orders')
    .update({
      payment_status: 'REFUNDED',
      refunded_at: new Date().toISOString(),
      refund_amount_bani: meta?.amountBani ?? null,
      refund_reason: meta?.reason ?? null,
    })
    .eq('stripe_payment_intent_id', stripePaymentIntentId);

  if (!wasAlreadyRefunded) {
    await adminAny.from('audit_log').insert({
      tenant_id: existing.tenant_id,
      actor_user_id: null, // Stripe webhook, not a logged-in admin
      action: 'order.refund_observed',
      entity_type: 'restaurant_order',
      entity_id: existing.id,
      metadata: {
        source: 'stripe.charge.refunded',
        stripe_payment_intent_id: stripePaymentIntentId,
        amount_bani: meta?.amountBani ?? null,
        reason: meta?.reason ?? null,
      },
    });
  }
}

// ============================================================
// Dispute (chargeback) intake — payment-lifecycle PR 2
// ============================================================
type DisputeEventType =
  | 'charge.dispute.created'
  | 'charge.dispute.updated'
  | 'charge.dispute.closed'
  | 'charge.dispute.funds_withdrawn'
  | 'charge.dispute.funds_reinstated';

// Minimal Stripe.Dispute shape we depend on. Inlined to avoid pulling the
// full Stripe type into this module (the webhook route imports the full
// type and passes us the object). Keeping this internal makes the
// observation contract explicit.
type DisputeShape = {
  id: string;
  amount?: number | null;
  reason?: string | null;
  status?: string | null;
  evidence_details?: { due_by?: number | null } | null;
  charge?: string | { id?: string; payment_intent?: string | { id?: string } | null } | null;
  payment_intent?: string | { id?: string } | null;
};

function disputeIntentId(d: DisputeShape): string | null {
  // payment_intent is sometimes on the dispute, sometimes only on the
  // expanded charge. Try both. String or object, expanded or not.
  if (typeof d.payment_intent === 'string') return d.payment_intent;
  if (d.payment_intent && typeof d.payment_intent === 'object' && d.payment_intent.id) {
    return d.payment_intent.id;
  }
  if (d.charge && typeof d.charge === 'object' && d.charge.payment_intent) {
    if (typeof d.charge.payment_intent === 'string') return d.charge.payment_intent;
    if (typeof d.charge.payment_intent === 'object' && d.charge.payment_intent.id) {
      return d.charge.payment_intent.id;
    }
  }
  return null;
}

async function sendHepiDisputeAlert(args: {
  eventType: DisputeEventType;
  disputeId: string;
  amountBani: number | null;
  reason: string | null;
  orderId: string | null;
}): Promise<void> {
  // Alerts only on the two events that warrant immediate human attention.
  // .updated/.closed/.funds_reinstated would generate noise.
  if (
    args.eventType !== 'charge.dispute.created' &&
    args.eventType !== 'charge.dispute.funds_withdrawn'
  ) {
    return;
  }
  const bot = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_IULIAN_CHAT_ID;
  if (!bot || !chatId) return; // env-gated, fail-soft

  const ron = args.amountBani != null ? (args.amountBani / 100).toFixed(2) : '?';
  const headline =
    args.eventType === 'charge.dispute.created'
      ? '🚨 <b>Dispută nouă Stripe</b>'
      : '💸 <b>Fonduri retrase de Stripe (dispută)</b>';
  const lines = [
    headline,
    `Dispute: <code>${args.disputeId}</code>`,
    `Sumă: ${ron} RON`,
  ];
  if (args.reason) lines.push(`Motiv: ${args.reason}`);
  if (args.orderId) lines.push(`Comandă: <code>${args.orderId}</code>`);

  try {
    await fetch(`https://api.telegram.org/bot${bot}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: lines.join('\n'),
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });
  } catch (err) {
    // Best-effort. Webhook handler must not fail because Telegram is down.
    console.warn('[stripe-dispute] hepi alert failed:', (err as Error).message);
  }
}

/**
 * payment-lifecycle PR 2: upsert a Stripe dispute into payment_disputes and
 * flag the linked order as disputed. INTAKE ONLY — no money movement, no
 * stripe.disputes.update calls. The merchant resolves disputes via Stripe
 * dashboard until we build evidence-submission UI.
 *
 * Idempotent: stripe_dispute_id is UNIQUE, so we use upsert(onConflict).
 * Stripe replays of the same event are absorbed by the webhook-level
 * stripe_events_processed guard; the upsert here is belt-and-braces for
 * cross-event consistency (created → updated → closed all touch the same row).
 */
export async function recordDisputeEvent(
  eventType: DisputeEventType,
  dispute: DisputeShape,
): Promise<void> {
  const admin = getSupabaseAdmin();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adminAny = admin as any;

  // Resolve the linked order via the dispute's payment_intent (same link
  // used for charge.refunded). null is acceptable — we still record the
  // dispute, just without an order_id; admins can reconcile later.
  const intentId = disputeIntentId(dispute);
  let orderId: string | null = null;
  let tenantId: string | null = null;
  if (intentId) {
    const { data: order } = await adminAny
      .from('restaurant_orders')
      .select('id, tenant_id')
      .eq('stripe_payment_intent_id', intentId)
      .single();
    if (order) {
      orderId = order.id;
      tenantId = order.tenant_id;
    }
  }

  const evidenceDueBy =
    dispute.evidence_details?.due_by != null
      ? new Date(dispute.evidence_details.due_by * 1000).toISOString()
      : null;

  const { error: upsertErr } = await adminAny.from('payment_disputes').upsert(
    {
      order_id: orderId,
      stripe_dispute_id: dispute.id,
      amount_bani: dispute.amount ?? null,
      reason: dispute.reason ?? null,
      status: dispute.status ?? null,
      evidence_due_by: evidenceDueBy,
      raw_payload: dispute as unknown as Record<string, unknown>,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'stripe_dispute_id' },
  );
  if (upsertErr) {
    // Bubble up so the webhook rolls back the idempotency row and Stripe retries.
    throw new Error(`payment_disputes upsert failed: ${upsertErr.message}`);
  }

  // Flag the order as disputed on .created. Other events update payment_disputes
  // but don't change the order flag (a closed-in-our-favor dispute should still
  // show as historically disputed for ops review).
  if (eventType === 'charge.dispute.created' && orderId) {
    await adminAny
      .from('restaurant_orders')
      .update({ disputed: true })
      .eq('id', orderId);
  }

  // Audit log entry — only when we have a tenant context. A dispute we
  // can't link to an order has nowhere to file the audit row (audit_log.tenant_id
  // is NOT NULL).
  if (tenantId) {
    await adminAny.from('audit_log').insert({
      tenant_id: tenantId,
      actor_user_id: null,
      action: `payment.dispute.${eventType.split('.').pop()}`,
      entity_type: 'payment_dispute',
      entity_id: dispute.id,
      metadata: {
        order_id: orderId,
        amount_bani: dispute.amount ?? null,
        reason: dispute.reason ?? null,
        status: dispute.status ?? null,
      },
    });
  }

  await sendHepiDisputeAlert({
    eventType,
    disputeId: dispute.id,
    amountBani: dispute.amount ?? null,
    reason: dispute.reason ?? null,
    orderId,
  });
}
