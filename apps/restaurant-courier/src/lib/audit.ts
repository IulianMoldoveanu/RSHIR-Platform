// Thin audit-log helper for the courier app (mirrors apps/restaurant-admin/src/lib/audit.ts).
// Writes to the shared `audit_log` table via service-role client.
// Failures are swallowed — auditing must never block the user action.
//
// 2026-05-10 fix: audit_log.tenant_id is NOT NULL (per schema). Courier
// actions don't have direct tenant context (the courier serves orders
// across fleets), so we derive tenant_id from the courier_order →
// restaurant_orders.tenant_id chain when entityType is 'courier_order'.
// If derivation fails, we skip the insert + warn (same outcome as the
// previous silent failure — but no more NOT-NULL constraint noise in
// CI logs).

import { createAdminClient } from './supabase/admin';

export type CourierAuditAction =
  | 'fleet.created'
  | 'fleet.updated'
  | 'fleet.activated'
  | 'fleet.deactivated'
  | 'fleet.courier_invited'
  | 'fleet.api_key_created'
  | 'fleet.api_key_revoked'
  | 'fleet.settings_updated'
  | 'fleet.order_assigned'
  | 'fleet.order_unassigned'
  | 'fleet.courier_suspended'
  | 'fleet.courier_reactivated'
  | 'fleet.order_auto_assigned'
  | 'fleet.courier_self_invited'
  | 'fleet.courier_note_updated'
  | 'fleet.bulk_auto_assigned'
  | 'order.cash_collected'
  | 'order.force_cancelled_by_courier'
  | 'delivery.geofence_warning'
  | 'pharma.callback_sent';

async function deriveTenantId(
  admin: ReturnType<typeof createAdminClient>,
  entityType: string | undefined,
  entityId: string | undefined,
): Promise<string | null> {
  if (entityType !== 'courier_order' || !entityId) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any;
  const { data: order } = await sb
    .from('courier_orders')
    .select('restaurant_order_id')
    .eq('id', entityId)
    .maybeSingle();
  const restaurantOrderId =
    (order as { restaurant_order_id: string | null } | null)?.restaurant_order_id ?? null;
  if (!restaurantOrderId) return null;
  const { data: ro } = await sb
    .from('restaurant_orders')
    .select('tenant_id')
    .eq('id', restaurantOrderId)
    .maybeSingle();
  return (ro as { tenant_id: string | null } | null)?.tenant_id ?? null;
}

export async function logAudit(args: {
  actorUserId: string;
  action: CourierAuditAction;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  /** Optional override; when omitted we derive from the courier_order → restaurant_orders chain. */
  tenantId?: string;
}): Promise<void> {
  try {
    const admin = createAdminClient();
    const tenantId = args.tenantId ?? (await deriveTenantId(admin, args.entityType, args.entityId));
    if (!tenantId) {
      // No tenant context derivable (e.g. fleet-level event without a
      // restaurant order, or pharma vertical). Skip the insert + warn so
      // the action proceeds. NOT a regression — previously the insert ran
      // with tenant_id: null and crashed against the NOT NULL constraint,
      // logging the same kind of error.
      console.warn(
        '[courier-audit] skipping insert (no tenant context derivable)',
        args.action,
        args.entityType,
        args.entityId,
      );
      return;
    }
    // audit_log may not be in generated types yet; cast through unknown.
    const sb = admin as unknown as {
      from: (t: string) => {
        insert: (row: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
      };
    };
    const { error } = await sb.from('audit_log').insert({
      tenant_id: tenantId,
      actor_user_id: args.actorUserId,
      action: args.action,
      entity_type: args.entityType ?? null,
      entity_id: args.entityId ?? null,
      metadata: args.metadata ?? null,
    });
    if (error) {
      console.error('[courier-audit] insert failed', args.action, error.message);
    }
  } catch (e) {
    console.error('[courier-audit] threw', args.action, e);
  }
}
