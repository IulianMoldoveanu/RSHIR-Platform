'use server';

import { revalidatePath } from 'next/cache';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { assertTenantMember, getActiveTenant } from '@/lib/tenant';
import { ALLOWED_TRANSITIONS, OrderTransitionError, type OrderStatus } from './status-machine';
import { logAudit } from '@/lib/audit';
import { dispatchOrderEvent } from '@/lib/integration-bus';

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

  revalidatePath('/dashboard/orders');
  revalidatePath(`/dashboard/orders/${orderId}`);
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
  const { data: existing, error: readErr } = await admin
    .from('restaurant_orders')
    .select('id, payment_method, payment_status')
    .eq('id', orderId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (readErr) throw new Error(readErr.message);
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

  const { error } = await admin
    .from('restaurant_orders')
    .update({ payment_status: 'PAID' })
    .eq('id', orderId)
    .eq('tenant_id', tenantId);
  if (error) throw new Error(error.message);

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
