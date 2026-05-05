// RSHIR-45: thin helper around the audit_log insert. Always called from
// server actions that have already verified tenant membership; we re-pass
// tenantId + actor (auth.users.id) and the helper writes via the
// service-role client. Failures are logged and swallowed — auditing is
// best-effort and must never block the underlying user action.

import { createAdminClient } from './supabase/admin';

export type AuditAction =
  | 'order.status_changed'
  | 'order.cancelled'
  | 'order.cod_marked_paid'
  | 'branding.logo_uploaded'
  | 'branding.cover_uploaded'
  | 'branding.color_changed'
  | 'notifications.email_toggled'
  | 'notifications.daily_digest_toggled'
  | 'promo.created'
  | 'promo.deleted'
  | 'tenant.created'
  | 'tenant.went_live'
  | 'review.hidden'
  | 'review.unhidden'
  | 'menu.sold_out_set'
  | 'menu.sold_out_cleared'
  | 'menu.gloriafood_import'
  | 'integration.provider_added'
  | 'integration.provider_removed'
  | 'integration.dispatched'
  | 'integration.webhook_received'
  | 'integration.api_key_created'
  | 'integration.api_key_revoked'
  | 'loyalty.settings_updated'
  | 'loyalty.points_earned'
  | 'loyalty.points_redeemed'
  | 'loyalty.points_adjusted'
  | 'reservation.requested'
  | 'reservation.confirmed'
  | 'reservation.rejected'
  | 'reservation.cancelled'
  | 'reservation.noshow'
  | 'reservation.completed'
  | 'reservation.settings_updated'
  | 'reservation.table_plan_updated'
  | 'ai_ceo.brief_schedule_updated'
  | 'ai_ceo.suggestion_acted'
  | 'partner.created'
  | 'partner.referral_added'
  | 'partner.referral_attributed'
  | 'partner.commission_marked_paid'
  | 'partner.profile_updated'
  | 'partner.code_generated'
  | 'partner.landing_updated'
  | 'team.zone_capability_granted'
  | 'team.zone_capability_revoked'
  | 'affiliate.application_approved'
  | 'affiliate.application_rejected'
  | 'affiliate.marked_spam';

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
