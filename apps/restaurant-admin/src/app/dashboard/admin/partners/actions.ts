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
// generatePartnerCode — assigns a fresh public code to a partner.
// Code is 8 chars [A-Z2-9] (no 0/O/1/I/L for legibility).
// Retries on collision up to 5 times.
// ────────────────────────────────────────────────────────────

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function randomPartnerCode(len = 8): string {
  let s = '';
  for (let i = 0; i < len; i++) {
    s += CODE_ALPHABET.charAt(Math.floor(Math.random() * CODE_ALPHABET.length));
  }
  return s;
}

export async function generatePartnerCode(input: {
  partner_id: string;
}): Promise<{ ok: true; code: string } | { ok: false; error: string }> {
  const guard = await requirePlatformAdmin();
  if ('error' in guard) return { ok: false, error: guard.error };

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any;

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomPartnerCode();
    const { error } = await sb
      .from('partners')
      .update({ code, updated_at: new Date().toISOString() })
      .eq('id', input.partner_id);
    if (!error) {
      await logAudit({
        tenantId: '00000000-0000-0000-0000-000000000000',
        actorUserId: guard.userId,
        action: 'partner.code_generated',
        entityType: 'partner',
        entityId: input.partner_id,
        metadata: { code },
      });
      revalidatePath(REVALIDATE);
      return { ok: true, code };
    }
    // Unique-violation on partners_code_unique -> retry; anything else -> bail.
    if (!/duplicate|unique|partners_code_unique/i.test(error.message ?? '')) {
      return { ok: false, error: error.message };
    }
  }
  return { ok: false, error: 'Failed to generate unique code after 5 attempts.' };
}

// ────────────────────────────────────────────────────────────
// updatePartnerLanding — updates the white-label landing JSON.
// ────────────────────────────────────────────────────────────

export async function updatePartnerLanding(input: {
  partner_id: string;
  headline?: string;
  blurb?: string;
  cta_url?: string;
  accent_color?: string;
  hero_image_url?: string;
}): Promise<PartnerActionResult> {
  const guard = await requirePlatformAdmin();
  if ('error' in guard) return { ok: false, error: guard.error };

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any;

  // Build the patch by stripping undefined keys so missing fields keep their
  // existing value via Postgres jsonb merge.
  const patch: Record<string, unknown> = {};
  for (const k of ['headline', 'blurb', 'cta_url', 'accent_color', 'hero_image_url'] as const) {
    const v = input[k];
    if (typeof v === 'string') patch[k] = v;
  }
  if (Object.keys(patch).length === 0) return { ok: false, error: 'Nimic de actualizat.' };

  const { error } = await sb.rpc('partner_landing_merge', {
    p_partner_id: input.partner_id,
    p_patch: patch,
  });
  if (error) {
    // Fallback: read-modify-write if RPC missing
    const { data, error: readErr } = await sb
      .from('partners')
      .select('landing_settings')
      .eq('id', input.partner_id)
      .single();
    if (readErr || !data) return { ok: false, error: readErr?.message ?? 'partner_not_found' };
    const merged = { ...(data.landing_settings ?? {}), ...patch };
    const { error: updErr } = await sb
      .from('partners')
      .update({ landing_settings: merged, updated_at: new Date().toISOString() })
      .eq('id', input.partner_id);
    if (updErr) return { ok: false, error: updErr.message };
  }

  await logAudit({
    tenantId: '00000000-0000-0000-0000-000000000000',
    actorUserId: guard.userId,
    action: 'partner.landing_updated',
    entityType: 'partner',
    entityId: input.partner_id,
    metadata: patch,
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
