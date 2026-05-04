// Thin audit-log helper for the courier app (mirrors apps/restaurant-admin/src/lib/audit.ts).
// Writes to the shared `audit_log` table via service-role client.
// Failures are swallowed — auditing must never block the user action.

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
  | 'order.cash_collected'
  | 'delivery.geofence_warning';

export async function logAudit(args: {
  actorUserId: string;
  action: CourierAuditAction;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    const admin = createAdminClient();
    // audit_log may not be in generated types yet; cast through unknown.
    const sb = admin as unknown as {
      from: (t: string) => {
        insert: (row: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
      };
    };
    const { error } = await sb.from('audit_log').insert({
      tenant_id: null,
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
