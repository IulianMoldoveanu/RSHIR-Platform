// RSHIR-51: server-only event bus for outbound integration events.
// Hook called after order/menu writes succeed. Looks up the tenant's
// integration_providers row; if STANDALONE (no row), returns immediately
// — zero overhead for current pilots. Otherwise inserts an
// integration_events row that the cron-driven Edge Function picks up
// and dispatches to the adapter.
//
// Failures are logged + swallowed: a flaky integration must NEVER block
// the underlying user action. Same pattern as logAudit().

import 'server-only';
import type {
  MenuEventName,
  MenuItemPayload,
  OrderEventName,
  OrderPayload,
} from '@hir/integration-core';
import { createAdminClient } from './supabase/admin';
import { logAudit } from './audit';

type EventRow = {
  tenant_id: string;
  provider_key: string;
  event_type: string;
  payload: Record<string, unknown>;
};

type ActiveProvider = {
  provider_key: string;
  config: Record<string, unknown>;
};

// Rate limit applied only to Custom providers — they hit a tenant-
// supplied URL we don't fully trust. Other adapters (mock / freya /
// iiko / posnet) talk to vendor-controlled or internal destinations
// and have their own rate-limit story.
const CUSTOM_HOURLY_LIMIT = 100;

async function activeProviders(tenantId: string): Promise<ActiveProvider[]> {
  const admin = createAdminClient();
  const sb = admin as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          eq: (col: string, val: boolean) => Promise<{
            data: ActiveProvider[] | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
  };
  const { data, error } = await sb
    .from('integration_providers')
    .select('provider_key, config')
    .eq('tenant_id', tenantId)
    .eq('is_active', true);
  if (error) {
    console.error('[integration-bus] provider lookup failed', tenantId, error.message);
    return [];
  }
  return (data ?? []).map((r) => ({
    provider_key: r.provider_key,
    config: (r.config ?? {}) as Record<string, unknown>,
  }));
}

// Custom-only — count the last hour of enqueued events to enforce a
// crude rate limit. Approximate (counts based on created_at) but good
// enough to stop a runaway loop or a tenant pointing us at an endpoint
// that 200s on every request.
async function shouldThrottleCustom(tenantId: string): Promise<boolean> {
  const admin = createAdminClient();
  const sinceIso = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const sb = admin as unknown as {
    from: (t: string) => {
      select: (cols: string, opts: { count: 'exact'; head: boolean }) => {
        eq: (col: string, val: string) => {
          eq: (col: string, val: string) => {
            gte: (col: string, val: string) => Promise<{
              count: number | null;
              error: { message: string } | null;
            }>;
          };
        };
      };
    };
  };
  const { count, error } = await sb
    .from('integration_events')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('provider_key', 'custom')
    .gte('created_at', sinceIso);
  if (error) {
    console.error('[integration-bus] rate-limit count failed', tenantId, error.message);
    return false; // Fail-open: don't drop real events because we can't count.
  }
  return (count ?? 0) >= CUSTOM_HOURLY_LIMIT;
}

// Custom config validation — duplicated from integration-core to avoid
// pulling the package import surface into the bus path. Kept minimal
// (just the fire_on_statuses lookup); URL/SSRF is enforced at config
// save time by addProvider().
function customStatusFilterPasses(
  config: Record<string, unknown>,
  eventType: string,
  payload: Record<string, unknown>,
): boolean {
  const list = config.fire_on_statuses;
  if (!Array.isArray(list) || list.length === 0) {
    // No filter configured -> drop nothing (defensive; addProvider
    // requires at least one status, but a hand-edited row could
    // skip this).
    return true;
  }
  // For status_changed events, check the new status from payload.
  // For 'created' / 'cancelled', the event name itself maps to a
  // logical status.
  if (eventType === 'order.status_changed') {
    const status = typeof payload.status === 'string' ? payload.status : null;
    if (!status) return false;
    return (list as string[]).includes(status);
  }
  if (eventType === 'order.created') return (list as string[]).includes('NEW');
  if (eventType === 'order.cancelled') return (list as string[]).includes('CANCELLED');
  // Menu events / unknown — let through; the adapter's onMenuEvent
  // will no-op for Custom anyway.
  return true;
}

// Custom-webhook adapters (Datecs companion, generic HTTPS endpoints,
// receipt printers) need the FULL order payload — items + totals +
// customer + dropoff + payment_method — to print a receipt or render
// the body. The status-change dispatch path
// (apps/restaurant-admin/src/app/dashboard/orders/actions.ts:81)
// intentionally sends an empty payload because vendor-specific
// adapters (mock/freya/iiko/posnet) already have the order from a
// prior order.created event. Custom adapters don't have that luxury
// — the receiver is a black box on the tenant's premises that may
// not have seen NEW.
//
// Fix: when at least one Custom provider would receive this event
// (filter passes, not throttled), we hydrate the payload from the
// DB before enqueueing. This is one extra indexed read per qualifying
// event and ONLY fires when a Custom is configured. mock/freya/iiko
// continue to receive the empty status-only payload (existing
// contract preserved).
async function hydrateOrderPayload(
  tenantId: string,
  orderId: string,
  fallbackStatus: string,
): Promise<Record<string, unknown> | null> {
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any;
  const { data, error } = await sb
    .from('restaurant_orders')
    .select(
      'id, status, payment_method, payment_status, ' +
        'subtotal_ron, delivery_fee_ron, total_ron, items, notes, ' +
        'customer:customers(first_name, phone), ' +
        'address:customer_addresses!delivery_address_id(line1, city)',
    )
    .eq('id', orderId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (error || !data) {
    console.error(
      '[integration-bus] hydrate failed',
      { tenantId, orderId },
      error?.message ?? 'not_found',
    );
    return null;
  }
  type LineItem = {
    name?: string;
    qty?: number;
    quantity?: number;
    priceRon?: number;
    price_ron?: number;
    unit_price_ron?: number;
    lineTotalRon?: number;
    line_total_ron?: number;
  };
  const rawItems = Array.isArray(data.items) ? (data.items as LineItem[]) : [];
  return {
    orderId: data.id,
    source: 'INTERNAL_STOREFRONT',
    status: (data.status as string) ?? fallbackStatus,
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
      subtotalRon: Number(data.subtotal_ron ?? 0),
      deliveryFeeRon: Number(data.delivery_fee_ron ?? 0),
      totalRon: Number(data.total_ron ?? 0),
    },
    customer: {
      firstName: (data.customer?.first_name as string | null) ?? '',
      phone: (data.customer?.phone as string | null) ?? '',
    },
    dropoff: data.address
      ? {
          line1: (data.address.line1 as string | null) ?? '',
          city: (data.address.city as string | null) ?? '',
        }
      : null,
    notes: (data.notes as string | null) ?? null,
    paymentMethod: (data.payment_method as 'CARD' | 'COD' | null) ?? null,
  };
}

// A payload counts as "empty" (worth hydrating) when items[] is empty
// AND totals.totalRon is 0/missing. Any payload with real lines or a
// real total is left alone (caller already provided full data —
// e.g. order.created path).
function isEmptyOrderPayload(p: Record<string, unknown>): boolean {
  const items = p.items;
  const totals = p.totals as Record<string, unknown> | undefined;
  const itemsEmpty = !Array.isArray(items) || items.length === 0;
  const totalRon = Number((totals?.totalRon as number | undefined) ?? 0);
  return itemsEmpty && totalRon === 0;
}

async function enqueue(rows: EventRow[]): Promise<void> {
  if (rows.length === 0) return;
  try {
    const admin = createAdminClient();
    const { error } = await admin.from('integration_events').insert(rows as never);
    if (error) {
      console.error('[integration-bus] enqueue failed', error.message);
      return;
    }
    // RSHIR-52: audit-log a dispatched event per tenant (one audit row covers all providers).
    const tenantId = rows[0]!.tenant_id;
    const eventType = rows[0]!.event_type;
    await logAudit({
      tenantId,
      actorUserId: null,
      action: 'integration.dispatched',
      entityType: 'integration_event',
      metadata: { event_type: eventType, providers: rows.map((r) => r.provider_key) },
    });
  } catch (e) {
    console.error('[integration-bus] enqueue threw', e);
  }
}

// Pre-flight probe used by the manual "Tipărește bon fiscal" button on
// the order detail page. dispatchOrderEvent() drops events that miss
// the status filter or hit the rate limit silently — that's the right
// behavior for the automatic event bus (we don't surface bus internals
// to a payment flow), but the manual reprint button needs to tell the
// operator WHY their click didn't print, otherwise they keep clicking.
//
// Returns:
//   - 'eligible'        — at least one Custom provider would receive
//                         the event (filter ok + not throttled)
//   - 'no_custom'       — no active Custom provider configured
//   - 'filtered_out'    — Custom provider exists but its
//                         `fire_on_statuses` excludes this status
//   - 'rate_limited'    — Custom provider exists, status passes, but
//                         the per-tenant hourly cap is hit
export type CustomDispatchEligibility =
  | 'eligible'
  | 'no_custom'
  | 'filtered_out'
  | 'rate_limited';

export async function probeCustomDispatchEligibility(
  tenantId: string,
  eventType: 'order.created' | 'order.status_changed' | 'order.cancelled',
  payload: { status?: string },
): Promise<CustomDispatchEligibility> {
  const providers = await activeProviders(tenantId);
  const customs = providers.filter((p) => p.provider_key === 'custom');
  if (customs.length === 0) return 'no_custom';
  // If ANY custom provider passes the status filter, dispatch is
  // eligible — at least one receiver will get the event. Otherwise
  // every custom is filtered out and the button is a no-op.
  const anyPasses = customs.some((p) =>
    customStatusFilterPasses(p.config, eventType, payload as Record<string, unknown>),
  );
  if (!anyPasses) return 'filtered_out';
  if (await shouldThrottleCustom(tenantId)) return 'rate_limited';
  return 'eligible';
}

export async function dispatchOrderEvent(
  tenantId: string,
  event: OrderEventName,
  payload: OrderPayload,
): Promise<void> {
  const providers = await activeProviders(tenantId);
  if (providers.length === 0) return;

  const eventType = `order.${event}`;
  const payloadObj = payload as unknown as Record<string, unknown>;

  // If a Custom provider is configured AND the caller passed a
  // status-only (empty) payload, hydrate from the DB before filtering.
  // Status filter needs `payload.status` (already set), but the
  // adapter receiver needs the rest. Cached so we hit the DB at most
  // once even if the tenant has multiple Custom providers.
  const orderId =
    typeof payloadObj.orderId === 'string' ? payloadObj.orderId : null;
  const fallbackStatus =
    typeof payloadObj.status === 'string' ? payloadObj.status : '';
  let customPayload: Record<string, unknown> = payloadObj;
  let customPayloadComputed = false;
  const ensureCustomPayload = async (): Promise<Record<string, unknown>> => {
    if (customPayloadComputed) return customPayload;
    customPayloadComputed = true;
    if (!orderId || !isEmptyOrderPayload(payloadObj)) {
      return customPayload;
    }
    const hydrated = await hydrateOrderPayload(tenantId, orderId, fallbackStatus);
    if (hydrated) {
      customPayload = hydrated;
    }
    return customPayload;
  };

  const eligible: EventRow[] = [];
  for (const p of providers) {
    if (p.provider_key === 'custom') {
      if (!customStatusFilterPasses(p.config, eventType, payloadObj)) {
        // Operator opted out of this status — drop without enqueuing.
        continue;
      }
      if (await shouldThrottleCustom(tenantId)) {
        console.warn('[integration-bus] custom rate limit reached', {
          tenantId,
          limit: CUSTOM_HOURLY_LIMIT,
        });
        continue;
      }
      const cp = await ensureCustomPayload();
      eligible.push({
        tenant_id: tenantId,
        provider_key: p.provider_key,
        event_type: eventType,
        payload: cp,
      });
      continue;
    }
    eligible.push({
      tenant_id: tenantId,
      provider_key: p.provider_key,
      event_type: eventType,
      payload: payloadObj,
    });
  }

  await enqueue(eligible);
}

export async function dispatchMenuEvent(
  tenantId: string,
  event: MenuEventName,
  payload: MenuItemPayload,
): Promise<void> {
  const providers = await activeProviders(tenantId);
  if (providers.length === 0) return;
  // Menu events skip Custom adapter (no-op in V1) — drop them at the
  // bus level so we don't queue rows that will mark themselves DEAD.
  await enqueue(
    providers
      .filter((p) => p.provider_key !== 'custom')
      .map((p) => ({
        tenant_id: tenantId,
        provider_key: p.provider_key,
        event_type: `menu.${event}`,
        payload: payload as unknown as Record<string, unknown>,
      })),
  );
}
