'use server';

// Affiliate-application review actions. Platform-admin only.
// APPROVE -> creates a partners row with tier='AFFILIATE' + bounty_one_shot_ron
// REJECT  -> marks application REJECTED with optional notes
// MARK_SPAM -> for moderator-flagged abuse

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { logAudit } from '@/lib/audit';
import { sendPartnerNotification } from '@/lib/email/partner-notify';
import { requirePlatformAdmin as requirePlatformAdminShared } from '@/lib/auth/platform-admin';

const REVALIDATE = '/dashboard/admin/affiliates';
const DEFAULT_BOUNTY_RON = 300;
const EXISTING_TENANT_BOUNTY_RON = 600;

// Public site root used for the affiliate's own referral link in approval
// emails. Defaults to the production Vercel domain — override via env when
// the custom domain (hirforyou.ro) is connected.
const PUBLIC_WEB_BASE_URL =
  process.env.NEXT_PUBLIC_RESTAURANT_WEB_URL ?? 'https://hir-restaurant-web.vercel.app';

// Code alphabet excludes ambiguous characters (0/O, 1/I/L) to keep the code
// readable when typed off a phone screen.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;

function randomCode(): string {
  let s = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    s += CODE_ALPHABET.charAt(Math.floor(Math.random() * CODE_ALPHABET.length));
  }
  return s;
}

async function requirePlatformAdmin(): Promise<{ userId: string; email: string } | { error: string }> {
  const r = await requirePlatformAdminShared();
  if (!r.ok) {
    return { error: r.status === 401 ? 'Unauthentificat.' : 'Acces interzis.' };
  }
  return { userId: r.userId, email: r.email };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySb = any;

const approveSchema = z.object({
  application_id: z.string().uuid(),
  notes: z.string().max(2000).optional(),
});

export async function approveAffiliateApplication(
  rawInput: unknown,
): Promise<{ ok: true; partner_id: string } | { ok: false; error: string }> {
  const guard = await requirePlatformAdmin();
  if ('error' in guard) return { ok: false, error: guard.error };

  const parsed = approveSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };
  const { application_id, notes } = parsed.data;

  const sb = createAdminClient() as unknown as AnySb;

  const { data: app, error: readErr } = await sb
    .from('affiliate_applications')
    .select('id, full_name, email, phone, audience_type, status, partner_id')
    .eq('id', application_id)
    .maybeSingle();
  if (readErr || !app) return { ok: false, error: 'application_not_found' };
  const a = app as {
    full_name: string;
    email: string;
    phone: string | null;
    audience_type: string;
    status: string;
    partner_id: string | null;
  };
  if (a.status !== 'PENDING') return { ok: false, error: `bad_status_${a.status}` };

  // Existing-tenant flag drives the bounty doubling.
  const isExistingTenant = a.audience_type === 'EXISTING_TENANT';
  const bounty = isExistingTenant ? EXISTING_TENANT_BOUNTY_RON : DEFAULT_BOUNTY_RON;

  // Two paths converge here:
  //   A) Self-service signup (Lane T): application has partner_id set + the
  //      partners row exists with status=PENDING + a generated code. We just
  //      flip status to ACTIVE and re-confirm the bounty amount.
  //   B) Manual /affiliate intake (legacy): no partner_id yet — create the
  //      partners row from scratch with a fresh code, status=ACTIVE.
  let partnerId: string | null = null;
  let assignedCode: string | null = null;

  if (a.partner_id) {
    // Path A — flip existing PENDING partner to ACTIVE.
    const { data: existing, error: readPartnerErr } = await sb
      .from('partners')
      .select('id, code, status')
      .eq('id', a.partner_id)
      .maybeSingle();
    if (readPartnerErr || !existing) {
      return { ok: false, error: 'pending_partner_not_found' };
    }
    if (!existing.code) {
      return { ok: false, error: 'pending_partner_missing_code' };
    }
    // Set the ids before the conditional flip so the application-update
    // path below runs on both first approval AND retry-after-partner-already-
    // flipped (Codex P1: don't early-return; the application row is the
    // queue's source of truth and must reach status=APPROVED + email + audit).
    partnerId = String(existing.id);
    assignedCode = String(existing.code);
    if (existing.status !== 'ACTIVE') {
      const { error: flipErr } = await sb
        .from('partners')
        .update({
          status: 'ACTIVE',
          bounty_one_shot_ron: bounty,
        })
        .eq('id', a.partner_id);
      if (flipErr) return { ok: false, error: flipErr.message };
    }
  } else {
    // Path B — legacy: create partners row + code from scratch.
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = randomCode();
      const { data: partner, error: partnerErr } = await sb
        .from('partners')
        .insert({
          name: a.full_name,
          email: a.email.toLowerCase(),
          phone: a.phone,
          status: 'ACTIVE',
          tier: 'AFFILIATE',
          default_commission_pct: 0,
          bounty_one_shot_ron: bounty,
          code,
        })
        .select('id')
        .single();
      if (!partnerErr && partner) {
        partnerId = String(partner.id);
        assignedCode = code;
        break;
      }
      // Retry only on code uniqueness collision; bail on anything else.
      const msg = partnerErr?.message ?? '';
      if (!/duplicate|unique|partners_code_unique/i.test(msg)) {
        return { ok: false, error: msg || 'partner_insert_failed' };
      }
    }
    if (!partnerId || !assignedCode) {
      return { ok: false, error: 'code_generation_exhausted' };
    }
  }

  // Mark application APPROVED
  const { error: updErr } = await sb
    .from('affiliate_applications')
    .update({
      status: 'APPROVED',
      reviewed_by: guard.userId,
      reviewed_at: new Date().toISOString(),
      reviewer_notes: notes ?? null,
      partner_id: partnerId,
    })
    .eq('id', application_id);
  if (updErr) return { ok: false, error: updErr.message };

  // PR3 — route through sendPartnerNotification so partners.notification_settings
  // (on_application_approved) is honoured. The helper itself audit-logs the
  // dispatch result; we still log the high-level affiliate.application_approved
  // event below for the admin queue audit trail. Email failure is non-fatal.
  const referralLink = `${PUBLIC_WEB_BASE_URL}/r/${assignedCode}`;
  const dashboardLink = process.env.NEXT_PUBLIC_RESTAURANT_ADMIN_URL
    ? `${process.env.NEXT_PUBLIC_RESTAURANT_ADMIN_URL}/partner-portal`
    : 'https://hir-restaurant-admin.vercel.app/partner-portal';
  const notifyRes = await sendPartnerNotification(partnerId, {
    kind: 'application_approved',
    code: assignedCode,
    bountyRon: bounty,
    referralUrl: referralLink,
    dashboardUrl: dashboardLink,
  }).catch((e) => ({ ok: false as const, reason: 'send_failed' as const, detail: e instanceof Error ? e.message : String(e) }));

  await logAudit({
    tenantId: '00000000-0000-0000-0000-000000000000',
    actorUserId: guard.userId,
    action: 'affiliate.application_approved',
    entityType: 'affiliate_application',
    entityId: application_id,
    metadata: {
      partner_id: partnerId,
      partner_code: assignedCode,
      bounty_one_shot_ron: bounty,
      audience_type: a.audience_type,
      email_sent: notifyRes.ok && 'sent' in notifyRes ? notifyRes.sent : false,
      email_skip_reason: notifyRes.ok && 'sent' in notifyRes && !notifyRes.sent ? notifyRes.reason : null,
      email_error: notifyRes.ok ? null : notifyRes.reason,
    },
  });

  revalidatePath(REVALIDATE);
  return { ok: true, partner_id: partnerId };
}

const rejectSchema = z.object({
  application_id: z.string().uuid(),
  notes: z.string().max(2000).optional(),
  spam: z.boolean().optional(),
});

export async function rejectAffiliateApplication(
  rawInput: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const guard = await requirePlatformAdmin();
  if ('error' in guard) return { ok: false, error: guard.error };
  const parsed = rejectSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  const sb = createAdminClient() as unknown as AnySb;

  const finalStatus = parsed.data.spam ? 'SPAM' : 'REJECTED';
  const { error } = await sb
    .from('affiliate_applications')
    .update({
      status: finalStatus,
      reviewed_by: guard.userId,
      reviewed_at: new Date().toISOString(),
      reviewer_notes: parsed.data.notes ?? null,
    })
    .eq('id', parsed.data.application_id);
  if (error) return { ok: false, error: error.message };

  await logAudit({
    tenantId: '00000000-0000-0000-0000-000000000000',
    actorUserId: guard.userId,
    action: parsed.data.spam ? 'affiliate.marked_spam' : 'affiliate.application_rejected',
    entityType: 'affiliate_application',
    entityId: parsed.data.application_id,
    metadata: { notes: parsed.data.notes ?? null },
  });

  revalidatePath(REVALIDATE);
  return { ok: true };
}
