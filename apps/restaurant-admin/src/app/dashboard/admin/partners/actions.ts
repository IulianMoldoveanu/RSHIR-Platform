'use server';

// Reseller program server actions.
// Gated by isPlatformAdmin() — uses HIR_PLATFORM_ADMIN_EMAILS env var (MVP).
// All writes go through the service-role client (bypasses RLS).
// audit_log calls pass tenantId = '' because these are platform-level events;
// the audit helper accepts null-ish tenantId gracefully (swallows errors).

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { logAudit } from '@/lib/audit';
import { buildLandingPatch, type LandingPatch } from '@/lib/partner-landing/validators';
import { requirePlatformAdmin as requirePlatformAdminShared } from '@/lib/auth/platform-admin';

const REVALIDATE = '/dashboard/admin/partners';

// ────────────────────────────────────────────────────────────
// Platform-admin gate
// ────────────────────────────────────────────────────────────

async function requirePlatformAdmin(): Promise<
  { userId: string; email: string } | { error: string }
> {
  const r = await requirePlatformAdminShared();
  if (!r.ok) {
    return {
      error: r.status === 401
        ? 'Unauthentificat.'
        : 'Acces interzis: nu ești administrator de platformă.',
    };
  }
  return { userId: r.userId, email: r.email };
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
//
// Validation lives in `@/lib/partner-landing/validators` so the partner
// self-serve action (apps/.../partner-portal/actions.ts) can share the
// exact same rules. See that module for security rationale per field.
//
// Fields supported (all optional, omitted ones keep their prior value via
// jsonb shallow-merge):
//   headline, blurb, cta_url, accent_color, hero_image_url   (legacy)
//   logo_url, tagline_ro, tagline_en, tenant_count_floor      (PR feat/wl-per-partner)
// ────────────────────────────────────────────────────────────

export async function updatePartnerLanding(input: {
  partner_id: string;
} & LandingPatch): Promise<PartnerActionResult> {
  const guard = await requirePlatformAdmin();
  if ('error' in guard) return { ok: false, error: guard.error };

  const built = buildLandingPatch({
    headline: input.headline,
    blurb: input.blurb,
    cta_url: input.cta_url,
    accent_color: input.accent_color,
    hero_image_url: input.hero_image_url,
    logo_url: input.logo_url,
    tagline_ro: input.tagline_ro,
    tagline_en: input.tagline_en,
    tenant_count_floor: input.tenant_count_floor,
  });
  if (!built.ok) return { ok: false, error: built.error };
  const patch = built.patch ?? {};
  if (Object.keys(patch).length === 0) return { ok: false, error: 'Nimic de actualizat.' };

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any;

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
