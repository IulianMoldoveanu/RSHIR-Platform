// RSHIR-51: server-only event bus for outbound integration events.
// Twin of apps/restaurant-admin/src/lib/integration-bus.ts; lives here
// because checkout / order-finalize on the storefront also need to
// fire integration events. Same logic, different supabase admin client
// import path.
//
// Failures are logged + swallowed: a flaky integration must NEVER block
// the underlying user action.

import 'server-only';
import type {
  MenuEventName,
  MenuItemPayload,
  OrderEventName,
  OrderPayload,
} from '@hir/integration-core';
import { getSupabaseAdmin } from './supabase-admin';

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

const CUSTOM_HOURLY_LIMIT = 100;

async function activeProviders(tenantId: string): Promise<ActiveProvider[]> {
  const admin = getSupabaseAdmin();
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

async function shouldThrottleCustom(tenantId: string): Promise<boolean> {
  const admin = getSupabaseAdmin();
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
    return false;
  }
  return (count ?? 0) >= CUSTOM_HOURLY_LIMIT;
}

function customStatusFilterPasses(
  config: Record<string, unknown>,
  eventType: string,
  payload: Record<string, unknown>,
): boolean {
  const list = config.fire_on_statuses;
  if (!Array.isArray(list) || list.length === 0) return true;
  if (eventType === 'order.status_changed') {
    const status = typeof payload.status === 'string' ? payload.status : null;
    if (!status) return false;
    return (list as string[]).includes(status);
  }
  if (eventType === 'order.created') return (list as string[]).includes('NEW');
  if (eventType === 'order.cancelled') return (list as string[]).includes('CANCELLED');
  return true;
}

// Custom-webhook adapters (Datecs companion, generic HTTPS endpoints)
// need the FULL order payload to render a fiscal receipt or render
// the body. Some HIR call sites (order-finalize.ts, status changes)
// dispatch order.status_changed with an empty payload because vendor
// adapters (mock/freya/iiko) already have the order from order.created.
// Custom adapters don't have that luxury — the receiver may have
// never seen NEW. We hydrate from DB at the bus level when:
//   - the event is dispatched to a Custom provider, AND
//   - the caller-provided payload is empty (items=[] AND totalRon=0).
// Mirrors apps/restaurant-admin/src/lib/integration-bus.ts.
async function hydrateOrderPayload(
  tenantId: string,
  orderId: string,
  fallbackStatus: string,
): Promise<Record<string, unknown> | null> {
  const admin = getSupabaseAdmin();
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
    const admin = getSupabaseAdmin();
    const { error } = await admin.from('integration_events').insert(rows as never);
    if (error) {
      console.error('[integration-bus] enqueue failed', error.message);
      return;
    }
    // RSHIR-52: best-effort audit row on successful queue insert.
    const tenantId = rows[0]!.tenant_id;
    const eventType = rows[0]!.event_type;
    const auditSb = getSupabaseAdmin() as unknown as {
      from: (t: string) => {
        insert: (row: Record<string, unknown>) => Promise<unknown>;
      };
    };
    auditSb
      .from('audit_log')
      .insert({
        tenant_id: tenantId,
        actor_user_id: null,
        action: 'integration.dispatched',
        entity_type: 'integration_event',
        entity_id: null,
        metadata: { event_type: eventType, providers: rows.map((r) => r.provider_key) },
      })
      .catch((e: unknown) => console.error('[integration-bus] audit insert threw', e));
  } catch (e) {
    console.error('[integration-bus] enqueue threw', e);
  }
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

  const orderId =
    typeof payloadObj.orderId === 'string' ? payloadObj.orderId : null;
  const fallbackStatus =
    typeof payloadObj.status === 'string' ? payloadObj.status : '';
  let customPayload: Record<string, unknown> = payloadObj;
  let customPayloadComputed = false;
  const ensureCustomPayload = async (): Promise<Record<string, unknown>> => {
    if (customPayloadComputed) return customPayload;
    customPayloadComputed = true;
    if (!orderId || !isEmptyOrderPayload(payloadObj)) return customPayload;
    const hydrated = await hydrateOrderPayload(tenantId, orderId, fallbackStatus);
    if (hydrated) customPayload = hydrated;
    return customPayload;
  };

  const eligible: EventRow[] = [];
  for (const p of providers) {
    if (p.provider_key === 'custom') {
      if (!customStatusFilterPasses(p.config, eventType, payloadObj)) continue;
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
