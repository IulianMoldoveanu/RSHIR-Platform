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

async function activeProviders(tenantId: string): Promise<string[]> {
  const admin = getSupabaseAdmin();
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
    const admin = getSupabaseAdmin();
    const { error } = await admin.from('integration_events').insert(rows as never);
    if (error) {
      console.error('[integration-bus] enqueue failed', error.message);
    }
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
