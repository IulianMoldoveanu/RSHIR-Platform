import 'server-only';
import { createHirDeliveryClient } from '@hir/delivery-client';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { dispatchOrderEvent } from '@/lib/integration-bus';

/**
 * Idempotent: marks a paid order as CONFIRMED and best-effort hands off to
 * the HIR delivery API. Safe to call multiple times (e.g. webhook + confirm
 * route racing on the same order).
 *
 * Sprint 1: delivery client throws (stub). We swallow and log so the order
 * still confirms — Sprint 4 wires the real call.
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

  await admin
    .from('restaurant_orders')
    .update({ payment_status: 'PAID', status: 'CONFIRMED' })
    .eq('id', orderId);

  // RSHIR-51: integration bus — when payment lands, fire status_changed so
  // any active POS adapter sees the transition PENDING → CONFIRMED. Tenant
  // id resolution requires a small lookup (the existing query above only
  // selected id/payment_status/status; tenant_id is not returned).
  const { data: orderTenant } = await admin
    .from('restaurant_orders')
    .select('tenant_id')
    .eq('id', orderId)
    .single();
  if (orderTenant?.tenant_id) {
    await dispatchOrderEvent(orderTenant.tenant_id, 'status_changed', {
      orderId,
      source: 'INTERNAL_STOREFRONT',
      status: 'CONFIRMED',
      items: [],
      totals: { subtotalRon: 0, deliveryFeeRon: 0, totalRon: 0 },
      customer: { firstName: '', phone: '' },
      dropoff: null,
      notes: null,
    });
  }

  // TODO Sprint 4: real delivery API wiring
  try {
    const client = createHirDeliveryClient({
      baseUrl: process.env.HIR_DELIVERY_API_BASE_URL ?? '',
      apiKey: process.env.HIR_DELIVERY_API_KEY ?? '',
    });
    await client.createOrder({
      externalOrderId: orderId,
      customer: { firstName: '', lastName: '', phone: '' },
      pickupAddress: { line1: '', city: '', country: 'RO', latitude: 0, longitude: 0 },
      dropoffAddress: { line1: '', city: '', country: 'RO', latitude: 0, longitude: 0 },
      items: [],
      totalRon: 0,
      deliveryFeeRon: 0,
    });
  } catch (err) {
    console.warn('[order-finalize] delivery handoff skipped (Sprint 4 wiring pending):', (err as Error).message);
  }
}

export async function markOrderPaymentFailed(orderId: string): Promise<void> {
  const admin = getSupabaseAdmin();
  await admin
    .from('restaurant_orders')
    .update({ payment_status: 'FAILED' })
    .eq('id', orderId);
}
