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

export async function dispatchOrderEvent(
  tenantId: string,
  event: OrderEventName,
  payload: OrderPayload,
): Promise<void> {
  const providers = await activeProviders(tenantId);
  if (providers.length === 0) return;

  const eventType = `order.${event}`;
  const payloadObj = payload as unknown as Record<string, unknown>;

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
