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
  | 'order.fiscal_receipt_reprint_requested'
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
  | 'menu.ai_parsed'
  | 'integration.provider_added'
  | 'integration.provider_removed'
  | 'integration.dispatched'
  | 'integration.webhook_received'
  | 'integration.api_key_created'
  | 'integration.api_key_revoked'
  | 'integration.test_webhook'
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
  | 'ai_ceo.run_reverted'
  | 'ai_ceo.run_approved'
  | 'ai_ceo.run_rejected'
  | 'ai_ceo.trust_level_updated'
  | 'partner.created'
  | 'partner.referral_added'
  | 'partner.referral_attributed'
  | 'partner.commission_marked_paid'
  | 'partner.profile_updated'
  | 'partner.code_generated'
  | 'partner.landing_updated'
  | 'partner.notification_settings_updated'
  | 'partner.notification_sent'
  | 'team.zone_capability_granted'
  | 'team.zone_capability_revoked'
  | 'affiliate.application_approved'
  | 'affiliate.application_rejected'
  | 'affiliate.marked_spam'
  | 'fleet_manager.membership_added'
  | 'fleet_manager.membership_removed'
  | 'fleet_manager.invite_created'
  | 'fleet_manager.invite_revoked'
  | 'fleet_manager.invite_accepted'
  | 'pairing_note.fleet_updated'
  | 'pairing_note.owner_updated'
  | 'pairing_note.fm_phone_updated'
  | 'tenant.external_dispatch_configured'
  | 'tenant.city_assigned'
  | 'tenant.presentation_updated'
  | 'fiscal.settings_updated'
  | 'fiscal.export_generated'
  | 'smartbill.settings_updated'
  | 'smartbill.token_set'
  | 'smartbill.token_cleared'
  | 'smartbill.test_connection'
  | 'smartbill.invoice_pushed'
  | 'smartbill.invoice_retried'
  | 'efactura.config_step_completed'
  | 'efactura.cert_uploaded'
  | 'efactura.token_set'
  | 'efactura.token_cleared'
  | 'efactura.test_connection'
  | 'inventory.item_created'
  | 'inventory.item_updated'
  | 'inventory.item_deleted'
  | 'inventory.recipe_linked'
  | 'inventory.recipe_unlinked'
  | 'inventory.manual_adjustment'
  | 'inventory.feature_toggled_on'
  | 'inventory.feature_toggled_off'
  | 'hepy.telegram_connect_link_generated'
  | 'hepy.telegram_unbound'
  | 'branding.theme_previewed'
  | 'branding.theme_applied'
  | 'voice.settings_updated'
  | 'voice.token_set'
  | 'voice.token_cleared'
  | 'voice.call_received'
  | 'voice.intent_dispatched'
  | 'voice.response_sent';

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
