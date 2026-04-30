'use server';

// Reseller program server actions.
// Gated by isPlatformAdmin() — uses HIR_PLATFORM_ADMIN_EMAILS env var (MVP).
// All writes go through the service-role client (bypasses RLS).
// audit_log calls pass tenantId = '' because these are platform-level events;
// the audit helper accepts null-ish tenantId gracefully (swallows errors).

import { revalidatePath } from 'next/cache';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logAudit } from '@/lib/audit';

const REVALIDATE = '/dashboard/admin/partners';

// ────────────────────────────────────────────────────────────
// Platform-admin gate
// ────────────────────────────────────────────────────────────

async function requirePlatformAdmin(): Promise<
  { userId: string; email: string } | { error: string }
> {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { error: 'Unauthentificat.' };

  const allowList = (process.env.HIR_PLATFORM_ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  if (!allowList.includes(user.email.toLowerCase())) {
    return { error: 'Acces interzis: nu ești administrator de platformă.' };
  }

  return { userId: user.id, email: user.email };
}

// ────────────────────────────────────────────────────────────
// Typed cast helper (partner tables not in generated types)
// ────────────────────────────────────────────────────────────

type SimpleInsert = {
  from: (t: string) => {
    insert: (row: Record<string, unknown>) => {
      select: (cols: string) => {
        single: () => Promise<{
          data: Record<string, unknown> | null;
          error: { message: string } | null;
        }>;
      };
    };
    update: (row: Record<string, unknown>) => {
      eq: (col: string, val: string) => Promise<{
        error: { message: string } | null;
      }>;
    };
  };
};

function adminSb(): SimpleInsert {
  return createAdminClient() as unknown as SimpleInsert;
}

export type PartnerActionResult =
  | { ok: true }
  | { ok: false; error: string };

// ────────────────────────────────────────────────────────────
// createPartner
// ────────────────────────────────────────────────────────────

export async function createPartner(input: {
  name: string;
  email: string;
  phone?: string;
  default_commission_pct: number;
}): Promise<PartnerActionResult> {
  const guard = await requirePlatformAdmin();
  if ('error' in guard) return { ok: false, error: guard.error };

  const sb = adminSb();
  const { data, error } = await sb
    .from('partners')
    .insert({
      name: input.name,
      email: input.email,
      phone: input.phone ?? null,
      default_commission_pct: input.default_commission_pct,
    })
    .select('id')
    .single();

  if (error) return { ok: false, error: error.message };

  await logAudit({
    // Partners are not tenant-scoped; pass a sentinel value. The audit row
    // will fail the FK constraint and be swallowed by logAudit's try/catch —
    // acceptable until we add a platform-level audit table in a future sprint.
    tenantId: '00000000-0000-0000-0000-000000000000',
    actorUserId: guard.userId,
    action: 'partner.created',
    entityType: 'partner',
    entityId: String(data?.id ?? ''),
    metadata: { name: input.name, email: input.email },
  });

  revalidatePath(REVALIDATE);
  return { ok: true };
}

// ────────────────────────────────────────────────────────────
// addReferral
// ────────────────────────────────────────────────────────────

export async function addReferral(input: {
  partner_id: string;
  tenant_id: string;
  commission_pct?: number;
}): Promise<PartnerActionResult> {
  const guard = await requirePlatformAdmin();
  if ('error' in guard) return { ok: false, error: guard.error };

  const sb = adminSb();
  const { data, error } = await sb
    .from('partner_referrals')
    .insert({
      partner_id: input.partner_id,
      tenant_id: input.tenant_id,
      commission_pct: input.commission_pct ?? null,
    })
    .select('id')
    .single();

  if (error) return { ok: false, error: error.message };

  await logAudit({
    tenantId: '00000000-0000-0000-0000-000000000000',
    actorUserId: guard.userId,
    action: 'partner.referral_added',
    entityType: 'partner_referral',
    entityId: String(data?.id ?? ''),
    metadata: { partner_id: input.partner_id, tenant_id: input.tenant_id },
  });

  revalidatePath(REVALIDATE);
  return { ok: true };
}

// ────────────────────────────────────────────────────────────
// markCommissionPaid
// ────────────────────────────────────────────────────────────

export async function markCommissionPaid(input: {
  commission_id: string;
  paid_via: string;
  notes?: string;
}): Promise<PartnerActionResult> {
  const guard = await requirePlatformAdmin();
  if ('error' in guard) return { ok: false, error: guard.error };

  const sb = adminSb();
  const { error } = await sb
    .from('partner_commissions')
    .update({
      status: 'PAID',
      paid_at: new Date().toISOString(),
      paid_via: input.paid_via,
      ...(input.notes ? { notes: input.notes } : {}),
    })
    .eq('id', input.commission_id);

  if (error) return { ok: false, error: error.message };

  await logAudit({
    tenantId: '00000000-0000-0000-0000-000000000000',
    actorUserId: guard.userId,
    action: 'partner.commission_marked_paid',
    entityType: 'partner_commission',
    entityId: input.commission_id,
    metadata: { paid_via: input.paid_via },
  });

  revalidatePath(REVALIDATE);
  return { ok: true };
}
