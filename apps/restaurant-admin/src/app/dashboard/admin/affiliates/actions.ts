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

const REVALIDATE = '/dashboard/admin/affiliates';
const DEFAULT_BOUNTY_RON = 300;
const EXISTING_TENANT_BOUNTY_RON = 600;

async function requirePlatformAdmin(): Promise<{ userId: string; email: string } | { error: string }> {
  const supa = createServerClient();
  const { data: { user } } = await supa.auth.getUser();
  if (!user?.email) return { error: 'Unauthentificat.' };
  const allow = (process.env.HIR_PLATFORM_ADMIN_EMAILS ?? '')
    .split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
  if (!allow.includes(user.email.toLowerCase())) return { error: 'Acces interzis.' };
  return { userId: user.id, email: user.email };
}

type AnySb = {
  from: (t: string) => {
    select: (cols: string) => {
      eq: (col: string, val: string) => {
        maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }>;
      };
    };
    insert: (row: Record<string, unknown>) => {
      select: (cols: string) => {
        single: () => Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }>;
      };
    };
    update: (row: Record<string, unknown>) => {
      eq: (col: string, val: string) => Promise<{ error: { message: string } | null }>;
    };
  };
};

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
  // both reseller and affiliate for uniform payouts ledger.
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
    })
    .select('id')
    .single();
  if (partnerErr || !partner) return { ok: false, error: partnerErr?.message ?? 'partner_insert_failed' };
  const partnerId = String(partner.id);

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

  await logAudit({
    tenantId: '00000000-0000-0000-0000-000000000000',
    actorUserId: guard.userId,
    action: 'affiliate.application_approved',
    entityType: 'affiliate_application',
    entityId: application_id,
    metadata: { partner_id: partnerId, bounty_one_shot_ron: bounty, audience_type: a.audience_type },
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
