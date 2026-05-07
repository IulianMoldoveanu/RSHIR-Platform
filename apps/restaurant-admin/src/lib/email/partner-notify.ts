import 'server-only';

// PR3 — partner notification dispatcher.
//
// Single entry point for partner-lifecycle emails so every caller (admin
// approval, future tenant-went-live cron sweep, future tenant-churned cron
// sweep) goes through the same opt-in gate + audit log.
//
// Reads partners.notification_settings (jsonb, defaults all-on per PR1
// migration) and skips dispatch if the relevant key is false. Email
// failures are logged to audit.metadata but never throw — the partner row
// is the source of truth, ops can re-send manually.

import { createAdminClient } from '@/lib/supabase/admin';
import { logAudit } from '@/lib/audit';
import { sendEmail } from './resend';
import {
  affiliateApprovedEmail,
  tenantWentLiveEmail,
  tenantChurnedEmail,
} from './templates';

export type PartnerEvent =
  | { kind: 'application_approved'; code: string; bountyRon: number; referralUrl: string; dashboardUrl: string }
  | { kind: 'tenant_went_live'; tenantName: string; estimatedMonthlyRon: number; dashboardUrl: string }
  | { kind: 'tenant_churned'; tenantName: string; reason: string | null; dashboardUrl: string };

// Map event kind → notification_settings key.
const SETTINGS_KEY: Record<PartnerEvent['kind'], string> = {
  application_approved: 'on_application_approved',
  tenant_went_live: 'on_tenant_went_live',
  tenant_churned: 'on_tenant_churned',
};

type PartnerRow = {
  id: string;
  name: string;
  email: string;
  notification_settings: Record<string, unknown> | null;
};

export type DispatchResult =
  | { ok: true; sent: true; emailId: string | null }
  | { ok: true; sent: false; reason: 'opted_out' | 'no_email' }
  | { ok: false; reason: 'partner_not_found' | 'send_failed'; detail?: string };

export async function sendPartnerNotification(
  partnerId: string,
  event: PartnerEvent,
): Promise<DispatchResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createAdminClient() as any;
  const { data: row, error } = await sb
    .from('partners')
    .select('id, name, email, notification_settings')
    .eq('id', partnerId)
    .maybeSingle();
  if (error || !row) return { ok: false, reason: 'partner_not_found', detail: error?.message };

  const partner = row as PartnerRow;
  if (!partner.email) return { ok: true, sent: false, reason: 'no_email' };

  // Default-on if jsonb is null or key missing. Only an explicit `false`
  // opts the partner out — matches PR1 migration default jsonb.
  const settings = partner.notification_settings ?? {};
  const optInKey = SETTINGS_KEY[event.kind];
  if (settings[optInKey] === false) {
    return { ok: true, sent: false, reason: 'opted_out' };
  }

  let tpl: { subject: string; html: string; text: string };
  switch (event.kind) {
    case 'application_approved':
      tpl = affiliateApprovedEmail({
        fullName: partner.name,
        code: event.code,
        bountyRon: event.bountyRon,
        referralUrl: event.referralUrl,
        dashboardUrl: event.dashboardUrl,
      });
      break;
    case 'tenant_went_live':
      tpl = tenantWentLiveEmail({
        partnerName: partner.name,
        tenantName: event.tenantName,
        estimatedMonthlyRon: event.estimatedMonthlyRon,
        dashboardUrl: event.dashboardUrl,
      });
      break;
    case 'tenant_churned':
      tpl = tenantChurnedEmail({
        partnerName: partner.name,
        tenantName: event.tenantName,
        reason: event.reason,
        dashboardUrl: event.dashboardUrl,
      });
      break;
  }

  const res = await sendEmail({
    to: partner.email,
    subject: tpl.subject,
    html: tpl.html,
    text: tpl.text,
  });

  await logAudit({
    tenantId: '00000000-0000-0000-0000-000000000000',
    actorUserId: null,
    action: 'partner.notification_sent',
    entityType: 'partner',
    entityId: partner.id,
    metadata: {
      event: event.kind,
      email_ok: res.ok,
      email_error: res.ok ? null : res.reason,
    },
  });

  if (!res.ok) return { ok: false, reason: 'send_failed', detail: res.reason };
  return { ok: true, sent: true, emailId: res.id };
}
