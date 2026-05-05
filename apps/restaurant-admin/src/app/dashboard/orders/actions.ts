'use server';

import { revalidatePath } from 'next/cache';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { assertTenantMember, getActiveTenant } from '@/lib/tenant';
import { ALLOWED_TRANSITIONS, OrderTransitionError, type OrderStatus } from './status-machine';
import { logAudit } from '@/lib/audit';
import { dispatchOrderEvent } from '@/lib/integration-bus';
import { awardLoyaltyForDeliveredOrder } from '@/lib/loyalty';
import {
  dispatchToExternalFleet,
  type ExternalDispatchPayload,
} from '@/lib/external-dispatch';

// RSHIR-32 M-1: callers pass the tenantId rendered server-side; we refuse
// the action if the cookie-derived active tenant has drifted (multi-tenant
// tab race — same pattern as RSHIR-26 M-3 for operations / onboarding).
async function requireTenant(expectedTenantId: string): Promise<{ userId: string; tenantId: string }> {
  if (!expectedTenantId) throw new Error('missing_tenant_id');
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthenticated.');
  const { tenant } = await getActiveTenant();
  if (tenant.id !== expectedTenantId) throw new Error('tenant_mismatch');
  await assertTenantMember(user.id, expectedTenantId);
  return { userId: user.id, tenantId: expectedTenantId };
}

async function loadOrderForTenant(orderId: string, tenantId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('restaurant_orders')
    .select('id, tenant_id, status')
    .eq('id', orderId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('Comanda nu exista in acest restaurant.');
  return data as { id: string; tenant_id: string; status: OrderStatus };
}

export async function updateOrderStatus(
  orderId: string,
  newStatus: OrderStatus,
  expectedTenantId: string,
): Promise<void> {
  const { tenantId, userId } = await requireTenant(expectedTenantId);
  const order = await loadOrderForTenant(orderId, tenantId);

  const allowed = ALLOWED_TRANSITIONS[order.status] ?? [];
  if (!allowed.includes(newStatus) || newStatus === 'CANCELLED') {
    throw new OrderTransitionError(
      `Tranzitie invalida ${order.status} → ${newStatus}.`,
      order.status,
      newStatus,
    );
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from('restaurant_orders')
    .update({ status: newStatus })
    .eq('id', orderId)
    .eq('tenant_id', tenantId);
  if (error) throw new Error(error.message);

  await logAudit({
    tenantId,
    actorUserId: userId,
    action: 'order.status_changed',
    entityType: 'order',
    entityId: orderId,
    metadata: { from: order.status, to: newStatus },
  });

  // RSHIR-51: notify any active POS adapter. Status-only payload is enough
  // for adapters that already received order.created — they have the rest.
  await dispatchOrderEvent(tenantId, 'status_changed', {
    orderId,
    source: 'INTERNAL_STOREFRONT',
    status: newStatus,
    items: [],
    totals: { subtotalRon: 0, deliveryFeeRon: 0, totalRon: 0 },
    customer: { firstName: '', phone: '' },
    dropoff: null,
    notes: null,
  });

  // Fleet Manager multi-tenant Option A: when the order is DISPATCHED and
  // the tenant is wired to an external Fleet Manager, POST a signed
  // payload to his dispatch endpoint. fireExternalDispatch is a no-op for
  // tenants without the feature configured. Errors are logged to
  // external_dispatch_attempts; never thrown — the order stays in
  // DISPATCHED state regardless and the operator can recover via the
  // platform-admin UI if the webhook is failing.
  if (newStatus === 'DISPATCHED') {
    // Fire-and-forget; don't block the action's revalidatePath. The retry
    // loop inside dispatchToExternalFleet has its own bounded timeout.
    fireExternalDispatch(orderId, tenantId).catch((err) => {
      console.error('[external-dispatch] unexpected error', (err as Error).message);
    });
  }

  // Award loyalty points on DELIVERED. Best-effort — never throws.
  if (newStatus === 'DELIVERED') {
    await awardLoyaltyForDeliveredOrder({ tenantId, orderId });
  }

  revalidatePath('/dashboard/orders');
  revalidatePath(`/dashboard/orders/${orderId}`);
}

// ────────────────────────────────────────────────────────────
// fireExternalDispatch — load order detail + post to external FM.
// Pulled into its own function so the success-path of updateOrderStatus
// stays linear. Never throws — it's a side-effect.
// ────────────────────────────────────────────────────────────

async function fireExternalDispatch(orderId: string, tenantId: string): Promise<void> {
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any;

  // restaurant_orders embeds the line items as JSONB ("items" col) and
  // links customer + delivery_address by FK. We pull all three in one
  // PostgREST embed so the FM webhook gets a self-contained payload.
  const { data: order, error } = await sb
    .from('restaurant_orders')
    .select(
      'id, tenant_id, total_ron, items, notes, ' +
        'customer:customers(first_name, last_name, phone), ' +
        'address:customer_addresses!delivery_address_id(line1, line2, city)',
    )
    .eq('id', orderId)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (error || !order) {
    console.error(
      '[external-dispatch] order load failed',
      error?.message ?? 'not_found',
    );
    return;
  }

  // restaurant_orders.items has multiple historical shapes — storefront
  // checkout writes priceRon (camel) per apps/restaurant-web/src/app/api/
  // checkout/pricing.ts; older paths also use price_ron / unit_price_ron.
  // Read all three and prefer in that order so the FM webhook always
  // gets a non-zero unit price (Codex P2 #280).
  type LineItem = {
    name?: string;
    quantity?: number;
    priceRon?: number;
    price_ron?: number;
    unit_price_ron?: number;
  };
  const rawItems = Array.isArray(order.items) ? (order.items as LineItem[]) : [];
  const customer = (order.customer ?? null) as
    | { first_name: string | null; last_name: string | null; phone: string | null }
    | null;
  const address = (order.address ?? null) as
    | { line1: string | null; line2: string | null; city: string | null }
    | null;

  const payload: ExternalDispatchPayload = {
    order_id: orderId,
    tenant_id: tenantId,
    dispatched_at: new Date().toISOString(),
    total_ron: Number(order.total_ron ?? 0),
    customer: {
      first_name: customer?.first_name ?? '',
      last_name: customer?.last_name ?? null,
      phone: customer?.phone ?? '',
    },
    delivery_address: {
      line1: address?.line1 ?? '',
      line2: address?.line2 ?? null,
      city: address?.city ?? null,
      notes: order.notes ?? null,
    },
    items: rawItems.map((i) => ({
      name: i.name ?? '',
      quantity: Number(i.quantity ?? 0),
      unit_price_ron: Number(i.priceRon ?? i.price_ron ?? i.unit_price_ron ?? 0),
    })),
  };

  const result = await dispatchToExternalFleet(payload);
  if (result.kind === 'failed') {
    console.error(
      `[external-dispatch] tenant=${tenantId} order=${orderId} failed after ${result.attempts} attempts: ${result.error}`,
    );
  }
}

/**
 * Mark a Cash-on-Delivery order as paid. Only eligible when payment_method
 * is COD and the order is currently UNPAID — card flows go through Stripe
 * webhook + /confirm and are out of scope here.
 */
export async function markCodOrderPaid(
  orderId: string,
  expectedTenantId: string,
): Promise<void> {
  const { tenantId, userId } = await requireTenant(expectedTenantId);

  const admin = createAdminClient();
  // Defensive: if 20260504_001 (payment_method column) hasn't applied to
  // this database yet, surface a clean Romanian error instead of leaking
  // PostgREST's raw "column does not exist" string into the toast.
  const { data: existing, error: readErr } = await admin
    .from('restaurant_orders')
    .select('id, payment_method, payment_status')
    .eq('id', orderId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (readErr) {
    if (/payment_method|payment_status/i.test(readErr.message ?? '')) {
      throw new Error(
        'Marcarea cash nu este disponibilă încă — migrația plății nu a fost aplicată.',
      );
    }
    throw new Error(readErr.message);
  }
  if (!existing) throw new Error('Comanda nu exista in acest restaurant.');

  const row = existing as unknown as {
    id: string;
    payment_method: 'CARD' | 'COD' | null;
    payment_status: string;
  };
  if (row.payment_method !== 'COD') {
    throw new Error('Doar comenzile cu plata cash pot fi marcate manual.');
  }
  if (row.payment_status === 'PAID') {
    return;
  }

  // Atomic guard: another admin (or a webhook) could have flipped this row
  // between the SELECT above and the UPDATE here. The filter on payment_method
  // + payment_status ensures we never silently mark a CARD or already-PAID
  // order as cash-paid. The pre-read still produces the friendlier error
  // messages above; this is the actual write-time invariant.
  // Cast through unknown — payment_method column is in the live DB (migration
  // 20260504_001) but supabase-types hasn't been regenerated; same pattern as
  // dashboard/orders/page.tsx around its cash filter.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const guarded = (admin
    .from('restaurant_orders')
    .update({ payment_status: 'PAID' })
    .eq('id', orderId)
    .eq('tenant_id', tenantId) as any)
    .eq('payment_method', 'COD')
    .eq('payment_status', 'UNPAID')
    .select('id');
  const { data: claimed, error } = (await guarded) as {
    data: Array<{ id: string }> | null;
    error: { message: string } | null;
  };
  if (error) throw new Error(error.message);
  if (!claimed || claimed.length === 0) {
    throw new Error('Comanda nu mai e eligibilă (a fost modificată între timp).');
  }

  await logAudit({
    tenantId,
    actorUserId: userId,
    action: 'order.cod_marked_paid',
    entityType: 'order',
    entityId: orderId,
    metadata: { from: row.payment_status, to: 'PAID' },
  });

  revalidatePath('/dashboard/orders');
  revalidatePath(`/dashboard/orders/${orderId}`);
}

export async function cancelOrder(
  orderId: string,
  expectedTenantId: string,
  reason?: string,
): Promise<void> {
  const { tenantId, userId } = await requireTenant(expectedTenantId);
  const order = await loadOrderForTenant(orderId, tenantId);

  if (order.status === 'DELIVERED' || order.status === 'CANCELLED') {
    throw new OrderTransitionError(
      `Comanda este deja ${order.status}.`,
      order.status,
      'CANCELLED',
    );
  }

  const admin = createAdminClient();
  const trimmed = reason?.trim();
  const update: { status: OrderStatus; notes?: string } = { status: 'CANCELLED' };
  if (trimmed) {
    update.notes = `[CANCELLED] ${trimmed}`;
  }
  const { error } = await admin
    .from('restaurant_orders')
    .update(update)
    .eq('id', orderId)
    .eq('tenant_id', tenantId);
  if (error) throw new Error(error.message);

  await logAudit({
    tenantId,
    actorUserId: userId,
    action: 'order.cancelled',
    entityType: 'order',
    entityId: orderId,
    metadata: { from: order.status, reason: trimmed ?? null },
  });

  await dispatchOrderEvent(tenantId, 'cancelled', {
    orderId,
    source: 'INTERNAL_STOREFRONT',
    status: 'CANCELLED',
    items: [],
    totals: { subtotalRon: 0, deliveryFeeRon: 0, totalRon: 0 },
    customer: { firstName: '', phone: '' },
    dropoff: null,
    notes: trimmed ?? null,
  });

  revalidatePath('/dashboard/orders');
  revalidatePath(`/dashboard/orders/${orderId}`);
}
