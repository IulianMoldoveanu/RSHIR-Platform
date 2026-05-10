'use server';

import { revalidatePath } from 'next/cache';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { assertTenantMember, getActiveTenant } from '@/lib/tenant';
import { ALLOWED_TRANSITIONS, OrderTransitionError, type OrderStatus } from './status-machine';
import { logAudit } from '@/lib/audit';
import { dispatchOrderEvent, probeCustomDispatchEligibility } from '@/lib/integration-bus';
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
  const supabase = await createServerClient();
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

// ────────────────────────────────────────────────────────────
// printFiscalReceipt — manually re-dispatch an order through any
// active Custom-webhook adapter so the desktop companion (e.g.
// tools/datecs-companion) re-prints the bon fiscal.
//
// Used when the receipt didn't print on the automatic DELIVERED hook
// (paper out, printer offline, network blip). Re-uses the existing
// dispatchOrderEvent pipeline → goes through the same status filter,
// rate limit, queue, retry, and audit log as automatic dispatch. No
// direct adapter call from the UI.
//
// Member-gated (not OWNER-only) — operators reprint receipts dozens
// of times a day in real kitchens; OWNER-gating that is operational
// friction. Audit log captures who clicked.
//
// Returns { ok, queued: boolean, reason?: string } so the client can
// distinguish "queued for print" from "no Custom provider configured"
// without throwing.
// ────────────────────────────────────────────────────────────

export type PrintFiscalReceiptResult =
  | { ok: true; queued: true }
  | { ok: true; queued: false; reason: 'no_custom_provider' | 'status_filtered_out' | 'rate_limited' }
  | { ok: false; error: string };

export async function printFiscalReceipt(
  orderId: string,
  expectedTenantId: string,
): Promise<PrintFiscalReceiptResult> {
  let tenantId: string;
  let userId: string;
  try {
    const guard = await requireTenant(expectedTenantId);
    tenantId = guard.tenantId;
    userId = guard.userId;
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any;

  // Load order with the same shape fireExternalDispatch uses, plus
  // payment_method / payment_status / status / total_ron breakdown
  // so the receipt builder can derive cash-vs-card and the line totals.
  const { data: order, error: orderErr } = await sb
    .from('restaurant_orders')
    .select(
      'id, tenant_id, status, payment_method, payment_status, ' +
        'subtotal_ron, delivery_fee_ron, total_ron, items, notes, ' +
        'customer:customers(first_name, phone), ' +
        'address:customer_addresses!delivery_address_id(line1, city)',
    )
    .eq('id', orderId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (orderErr) return { ok: false, error: orderErr.message };
  if (!order) return { ok: false, error: 'Comanda nu a fost găsită.' };

  type LineItem = {
    name?: string;
    quantity?: number;
    qty?: number;
    priceRon?: number;
    price_ron?: number;
    unit_price_ron?: number;
    lineTotalRon?: number;
    line_total_ron?: number;
  };
  const rawItems = Array.isArray(order.items) ? (order.items as LineItem[]) : [];

  // Build the OrderPayload shape integration-core expects. Mirror the
  // priceRon-then-fallbacks pattern from fireExternalDispatch so the
  // receipt has a non-zero unit price for older items. Also pass the
  // adjusted `lineTotalRon` when present so the Datecs receipt builder
  // can reconcile against the order total when modifiers / promos
  // were applied.
  const payload = {
    orderId: order.id as string,
    source: 'MANUAL_ADMIN' as const,
    status: order.status as string,
    items: rawItems.map((i) => {
      const qty = Number(i.qty ?? i.quantity ?? 1);
      const lineTotalRaw = i.lineTotalRon ?? i.line_total_ron;
      const out: { name: string; qty: number; priceRon: number; lineTotalRon?: number } = {
        name: i.name ?? 'Produs',
        qty,
        priceRon: Number(i.priceRon ?? i.price_ron ?? i.unit_price_ron ?? 0),
      };
      if (typeof lineTotalRaw === 'number' && Number.isFinite(lineTotalRaw)) {
        out.lineTotalRon = Number(lineTotalRaw);
      }
      return out;
    }),
    totals: {
      subtotalRon: Number(order.subtotal_ron ?? 0),
      deliveryFeeRon: Number(order.delivery_fee_ron ?? 0),
      totalRon: Number(order.total_ron ?? 0),
    },
    customer: {
      firstName: (order.customer?.first_name as string | null) ?? '',
      phone: (order.customer?.phone as string | null) ?? '',
    },
    dropoff: order.address
      ? {
          line1: (order.address.line1 as string | null) ?? '',
          city: (order.address.city as string | null) ?? '',
        }
      : null,
    notes: (order.notes as string | null) ?? null,
    // Pass-through so the companion can derive cash-vs-card without a
    // second DB lookup. The Custom envelope already strips internal
    // flags (see customAdapter.stripInternalFlags) — paymentMethod is
    // not internal; it's part of the public order shape. Companion
    // reads `order.paymentMethod` from the envelope.
    paymentMethod: (order.payment_method as 'CARD' | 'COD' | null) ?? null,
  };

  // Pre-flight eligibility probe — the manual reprint button must
  // tell the operator the truth. Without this check, the bus would
  // silently drop the event when (a) no Custom provider is configured,
  // (b) the operator's status filter excludes the current status (e.g.
  // they enabled DELIVERED-only and the order is PREPARING), or
  // (c) the per-tenant hourly cap is hit. UI would show "Trimis" while
  // nothing actually printed.
  const eligibility = await probeCustomDispatchEligibility(
    tenantId,
    'order.status_changed',
    { status: payload.status },
  );
  if (eligibility === 'no_custom') {
    return { ok: true, queued: false, reason: 'no_custom_provider' };
  }
  if (eligibility === 'filtered_out') {
    return { ok: true, queued: false, reason: 'status_filtered_out' };
  }
  if (eligibility === 'rate_limited') {
    return { ok: true, queued: false, reason: 'rate_limited' };
  }

  // Eligible — dispatch through the existing bus path. Queue + retry
  // handle transient failures from the companion.
  await dispatchOrderEvent(
    tenantId,
    'status_changed',
    payload as unknown as Parameters<typeof dispatchOrderEvent>[2],
  );

  await logAudit({
    tenantId,
    actorUserId: userId,
    action: 'order.fiscal_receipt_reprint_requested',
    entityType: 'order',
    entityId: orderId,
    metadata: { status_at_reprint: order.status },
  });

  revalidatePath(`/dashboard/orders/${orderId}`);

  return { ok: true, queued: true };
}
