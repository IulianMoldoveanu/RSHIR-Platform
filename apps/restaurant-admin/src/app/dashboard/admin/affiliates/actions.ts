'use server';

// Affiliate-application review actions. Platform-admin only.
// APPROVE -> creates a partners row with tier='AFFILIATE' + bounty_one_shot_ron
// REJECT  -> marks application REJECTED with optional notes
// MARK_SPAM -> for moderator-flagged abuse

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logAudit } from '@/lib/audit';
import { sendEmail } from '@/lib/email/resend';

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
  const supa = createServerClient();
  const { data: { user } } = await supa.auth.getUser();
  if (!user?.email) return { error: 'Unauthentificat.' };
  const allow = (process.env.HIR_PLATFORM_ADMIN_EMAILS ?? '')
    .split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
  if (!allow.includes(user.email.toLowerCase())) return { error: 'Acces interzis.' };
  return { userId: user.id, email: user.email };
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
    .select('id, full_name, email, phone, audience_type, status')
    .eq('id', application_id)
    .maybeSingle();
  if (readErr || !app) return { ok: false, error: 'application_not_found' };
  const a = app as { full_name: string; email: string; phone: string | null; audience_type: string; status: string };
  if (a.status !== 'PENDING') return { ok: false, error: `bad_status_${a.status}` };

  // Existing-tenant flag drives the bounty doubling.
  const isExistingTenant = a.audience_type === 'EXISTING_TENANT';
  const bounty = isExistingTenant ? EXISTING_TENANT_BOUNTY_RON : DEFAULT_BOUNTY_RON;

  // Create a partners row for this affiliate. Reuses partners schema across
  // both reseller and affiliate for uniform payouts ledger. We generate the
  // public referral code in the same insert: the code becomes the affiliate's
  // /r/<code> public landing identifier and is included in the approval email.
  // Retry on rare unique-violation collisions.
  let partnerId: string | null = null;
  let assignedCode: string | null = null;
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

  // Send the approval email + log the dispatch result. Email failure is
  // non-fatal — the partner row is the source of truth, ops can re-send
  // manually from the admin if needed.
  const emailRes = await sendApprovalEmail({
    to: a.email.toLowerCase(),
    fullName: a.full_name,
    code: assignedCode,
    bounty,
  }).catch((e) => ({ ok: false as const, reason: 'request_failed' as const, detail: e instanceof Error ? e.message : String(e) }));

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
      email_sent: emailRes.ok,
      email_error: emailRes.ok ? null : emailRes.reason,
    },
  });

  revalidatePath(REVALIDATE);
  return { ok: true, partner_id: partnerId };
}

// ────────────────────────────────────────────────────────────────────────
// Approval email — congrats + here's your code + here's your dashboard.
// ────────────────────────────────────────────────────────────────────────

async function sendApprovalEmail(args: {
  to: string;
  fullName: string;
  code: string;
  bounty: number;
}) {
  const referralLink = `${PUBLIC_WEB_BASE_URL}/r/${args.code}`;
  const dashboardLink = process.env.NEXT_PUBLIC_RESTAURANT_ADMIN_URL
    ? `${process.env.NEXT_PUBLIC_RESTAURANT_ADMIN_URL}/reseller`
    : 'https://hir-restaurant-admin.vercel.app/reseller';

  const subject = 'HIR Affiliate — bun venit, codul tău e aici';

  const text = `Salut ${args.fullName},

Te-am aprobat în HIR Affiliate Program.

Codul tău de afiliat: ${args.code}
Linkul tău public: ${referralLink}
Dashboard-ul tău: ${dashboardLink}

Bounty: ${args.bounty} RON pentru fiecare restaurant onboarded prin linkul tău.
Plată trimestrial pe factură PFA / SRL.

Distribuie linkul în lista ta — pe TikTok, Instagram, blog, sau direct pe WhatsApp către restaurantele pe care le cunoști. Fiecare restaurant care se înscrie + activează contul îți aduce bounty-ul.

Pentru întrebări, răspunde la acest email.

— Echipa HIR
https://hirforyou.ro`;

  const html = `<!DOCTYPE html>
<html><body style="font-family:system-ui,-apple-system,sans-serif;color:#0F172A;line-height:1.6;max-width:560px;margin:0 auto;padding:24px;">
<h2 style="margin:0 0 16px;font-size:22px;font-weight:600;">Bun venit în HIR Affiliate ✓</h2>
<p style="margin:0 0 12px;">Salut <strong>${escapeHtml(args.fullName)}</strong>,</p>
<p style="margin:0 0 16px;">Te-am aprobat în HIR Affiliate Program. Iată ce ai mai departe:</p>

<div style="margin:20px 0;padding:16px;border:1px solid #E2E8F0;border-radius:8px;background:#FAFAFA;">
  <div style="font-size:11px;font-weight:600;text-transform:uppercase;color:#475569;letter-spacing:0.04em;">Codul tău de afiliat</div>
  <div style="margin-top:6px;font-family:ui-monospace,Menlo,monospace;font-size:24px;font-weight:600;color:#4F46E5;letter-spacing:0.04em;">${escapeHtml(args.code)}</div>
</div>

<div style="margin:16px 0;padding:14px;border:1px solid #E2E8F0;border-radius:8px;">
  <div style="font-size:11px;font-weight:600;text-transform:uppercase;color:#475569;letter-spacing:0.04em;">Linkul tău public</div>
  <div style="margin-top:4px;font-family:ui-monospace,Menlo,monospace;font-size:13px;word-break:break-all;"><a href="${referralLink}" style="color:#4F46E5;text-decoration:none;">${escapeHtml(referralLink)}</a></div>
</div>

<p style="margin:20px 0 8px;"><strong>Bounty:</strong> ${args.bounty} RON pentru fiecare restaurant onboarded prin linkul tău. Plată trimestrial pe factură PFA / SRL.</p>

<p style="margin:24px 0 16px;">
  <a href="${dashboardLink}" style="display:inline-block;padding:11px 20px;background:#4F46E5;color:#fff;text-decoration:none;border-radius:6px;font-weight:500;font-size:14px;">Deschide dashboard-ul</a>
</p>

<p style="margin:24px 0 0;color:#94a3b8;font-size:12px;">Răspunde la acest email pentru întrebări. — Echipa HIR · <a href="https://hirforyou.ro" style="color:#4F46E5;">hirforyou.ro</a></p>
</body></html>`;

  return sendEmail({ to: args.to, subject, html, text });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]!));
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
