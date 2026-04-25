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

async function activeProviders(tenantId: string): Promise<string[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('integration_providers')
    .select('provider_key')
    .eq('tenant_id', tenantId)
    .eq('is_active', true);
  if (error) {
    console.error('[integration-bus] provider lookup failed', tenantId, error.message);
    return [];
  }
  return (data ?? []).map((r) => r.provider_key);
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
  await enqueue(
    providers.map((p) => ({
      tenant_id: tenantId,
      provider_key: p,
      event_type: `order.${event}`,
      payload: payload as unknown as Record<string, unknown>,
    })),
  );
}

export async function dispatchMenuEvent(
  tenantId: string,
  event: MenuEventName,
  payload: MenuItemPayload,
): Promise<void> {
  const providers = await activeProviders(tenantId);
  if (providers.length === 0) return;
  await enqueue(
    providers.map((p) => ({
      tenant_id: tenantId,
      provider_key: p,
      event_type: `menu.${event}`,
      payload: payload as unknown as Record<string, unknown>,
    })),
  );
}
