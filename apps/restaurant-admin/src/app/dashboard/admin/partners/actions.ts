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
//
// Security:
//   - cta_url: must be https:// OR start with '/' (relative). Length <= 500.
//     Blocks javascript:, data:, file:, ftp: schemes that could redirect
//     visitors to phishing or trigger XSS via inline navigation.
//   - hero_image_url: must be https:// AND host-allowlisted (Vercel blob,
//     Supabase storage, Cloudinary, Imgur, our own domains). Length <= 500.
//     Prevents reseller hosting CSAM / tracking pixels / mixed content.
//   - accent_color: must be a 4/7-char hex (#RGB or #RRGGBB) — React's
//     style prop sanitizes raw CSS but we double-validate to keep audit
//     logs clean.
//   - headline / blurb: length cap (200 / 1000 chars).
// ────────────────────────────────────────────────────────────

const HERO_HOST_ALLOWLIST = [
  'public.blob.vercel-storage.com',
  'images.unsplash.com',
  'res.cloudinary.com',
  'i.imgur.com',
  'qfmeojeipncuxeltnvab.supabase.co',
  'hirforyou.ro',
];

function validateCtaUrl(s: string): { ok: true } | { ok: false; error: string } {
  if (s.length > 500) return { ok: false, error: 'cta_url > 500 chars' };
  if (s.length === 0) return { ok: true }; // empty allowed -> use default
  if (s.startsWith('/')) return { ok: true }; // relative path
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return { ok: false, error: 'cta_url not a valid URL' };
  }
  if (u.protocol !== 'https:') return { ok: false, error: 'cta_url must be https://' };
  return { ok: true };
}

function validateHeroImageUrl(s: string): { ok: true } | { ok: false; error: string } {
  if (s.length > 500) return { ok: false, error: 'hero_image_url > 500 chars' };
  if (s.length === 0) return { ok: true };
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return { ok: false, error: 'hero_image_url not a valid URL' };
  }
  if (u.protocol !== 'https:') return { ok: false, error: 'hero_image_url must be https://' };
  if (!HERO_HOST_ALLOWLIST.includes(u.hostname)) {
    return { ok: false, error: `hero_image_url host not allow-listed (use one of: ${HERO_HOST_ALLOWLIST.join(', ')})` };
  }
  return { ok: true };
}

function validateAccentColor(s: string): { ok: true } | { ok: false; error: string } {
  if (s.length === 0) return { ok: true };
  if (!/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(s)) {
    return { ok: false, error: 'accent_color must be #RGB or #RRGGBB hex' };
  }
  return { ok: true };
}

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

  // Build the patch by stripping undefined keys so missing fields keep their
  // existing value via Postgres jsonb merge.
  const patch: Record<string, unknown> = {};
  if (typeof input.headline === 'string') {
    if (input.headline.length > 200) return { ok: false, error: 'headline > 200 chars' };
    patch.headline = input.headline;
  }
  if (typeof input.blurb === 'string') {
    if (input.blurb.length > 1000) return { ok: false, error: 'blurb > 1000 chars' };
    patch.blurb = input.blurb;
  }
  if (typeof input.cta_url === 'string') {
    const v = validateCtaUrl(input.cta_url);
    if (!v.ok) return { ok: false, error: v.error };
    patch.cta_url = input.cta_url;
  }
  if (typeof input.accent_color === 'string') {
    const v = validateAccentColor(input.accent_color);
    if (!v.ok) return { ok: false, error: v.error };
    patch.accent_color = input.accent_color;
  }
  if (typeof input.hero_image_url === 'string') {
    const v = validateHeroImageUrl(input.hero_image_url);
    if (!v.ok) return { ok: false, error: v.error };
    patch.hero_image_url = input.hero_image_url;
  }
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
