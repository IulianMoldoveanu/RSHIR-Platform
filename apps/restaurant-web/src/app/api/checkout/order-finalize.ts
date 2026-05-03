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
  const tenantSettings = (full.tenants?.settings ?? {}) as Record<string, unknown>;
  const pickupLat =
    typeof tenantSettings.location_lat === 'number' ? tenantSettings.location_lat : null;
  const pickupLng =
    typeof tenantSettings.location_lng === 'number' ? tenantSettings.location_lng : null;
  const pickupAddr =
    typeof tenantSettings.pickup_address === 'string' ? tenantSettings.pickup_address : null;
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
