'use server';

import { revalidatePath } from 'next/cache';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { assertTenantMember, getActiveTenant } from '@/lib/tenant';

export type OrderStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'PREPARING'
  | 'READY'
  | 'DISPATCHED'
  | 'IN_DELIVERY'
  | 'DELIVERED'
  | 'CANCELLED';

// Hard-coded forward path. Each key lists the statuses that may follow it.
// CANCELLED is allowed from any non-terminal state (handled separately in
// `cancelOrder`); DELIVERED and CANCELLED are terminal.
const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PREPARING', 'CANCELLED'],
  PREPARING: ['READY', 'CANCELLED'],
  READY: ['DISPATCHED', 'CANCELLED'],
  DISPATCHED: ['IN_DELIVERY', 'CANCELLED'],
  IN_DELIVERY: ['DELIVERED', 'CANCELLED'],
  DELIVERED: [],
  CANCELLED: [],
};

export class OrderTransitionError extends Error {
  constructor(
    message: string,
    public readonly from: OrderStatus,
    public readonly to: OrderStatus,
  ) {
    super(message);
    this.name = 'OrderTransitionError';
  }
}

export function nextStatuses(current: OrderStatus): OrderStatus[] {
  return ALLOWED_TRANSITIONS[current] ?? [];
}

async function requireTenant(): Promise<{ userId: string; tenantId: string }> {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthenticated.');
  const { tenant } = await getActiveTenant();
  await assertTenantMember(user.id, tenant.id);
  return { userId: user.id, tenantId: tenant.id };
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

export async function updateOrderStatus(orderId: string, newStatus: OrderStatus): Promise<void> {
  const { tenantId } = await requireTenant();
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

  revalidatePath('/dashboard/orders');
  revalidatePath(`/dashboard/orders/${orderId}`);
}

export async function cancelOrder(orderId: string, reason?: string): Promise<void> {
  const { tenantId } = await requireTenant();
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

  revalidatePath('/dashboard/orders');
  revalidatePath(`/dashboard/orders/${orderId}`);
}
