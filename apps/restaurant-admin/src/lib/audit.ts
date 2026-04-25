// RSHIR-45: thin helper around the audit_log insert. Always called from
// server actions that have already verified tenant membership; we re-pass
// tenantId + actor (auth.users.id) and the helper writes via the
// service-role client. Failures are logged and swallowed — auditing is
// best-effort and must never block the underlying user action.

import { createAdminClient } from './supabase/admin';

export type AuditAction =
  | 'order.status_changed'
  | 'order.cancelled'
  | 'branding.logo_uploaded'
  | 'branding.cover_uploaded'
  | 'branding.color_changed'
  | 'notifications.email_toggled'
  | 'notifications.daily_digest_toggled'
  | 'promo.created'
  | 'promo.deleted'
  | 'tenant.went_live';

export async function logAudit(args: {
  tenantId: string;
  actorUserId: string | null;
  action: AuditAction;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    const admin = createAdminClient();
    // audit_log is not yet in the generated supabase types (migration
    // 20260430_003_audit_log.sql ships in this commit; types regenerate
    // when the operator next runs supabase/gen-types.mjs). Cast through
    // unknown so the call typechecks regardless.
    const sb = admin as unknown as {
      from: (t: string) => {
        insert: (row: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
      };
    };
    const { error } = await sb.from('audit_log').insert({
      tenant_id: args.tenantId,
      actor_user_id: args.actorUserId,
      action: args.action,
      entity_type: args.entityType ?? null,
      entity_id: args.entityId ?? null,
      metadata: args.metadata ?? null,
    });
    if (error) {
      console.error('[audit] insert failed', args.action, error.message);
    }
  } catch (e) {
    console.error('[audit] threw', args.action, e);
  }
}
