'use server';

// Platform-admin in-person tenant onboarding. Iulian sits next to the patron,
// types 4 fields, gets a working storefront in <10 min. The patron's auth user
// is created with email_confirm: true (Iulian vouches for the email in person)
// AND a random temp password the patron rotates later. The calling platform
// admin is also added as OWNER so the rest of onboarding (master-key import,
// branding, go-live) can be driven from the same session — he switches tenant
// via the existing TENANT_COOKIE and reuses /dashboard/onboarding/...
//
// Gate: HIR_PLATFORM_ADMIN_EMAILS env (same as /dashboard/admin/partners +
// /dashboard/admin/affiliates). No new schema. Reuses everything from the
// public /api/signup path: tenants insert, tenant_members insert, default
// delivery_pricing_tiers seed.

import { cookies } from 'next/headers';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { TENANT_COOKIE } from '@/lib/tenant';
import { logAudit } from '@/lib/audit';

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

export type CreateTenantInput = {
  email: string;
  restaurantName: string;
  slug: string;
  phone?: string;
};

export type CreateTenantResult =
  | {
      ok: true;
      tenantId: string;
      ownerUserId: string;
      slug: string;
      tempPassword: string;
      storefrontUrl: string;
    }
  | { ok: false; error: string; code?: 'forbidden' | 'invalid' | 'slug_taken' | 'email_taken' | 'auth_failed' | 'tenant_failed' | 'member_failed' };

function isPlatformAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  const allow = (process.env.HIR_PLATFORM_ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return allow.includes(email.toLowerCase());
}

// 16-char base64url, ~96 bits of entropy. Caller shows it once in the
// success card; the patron rotates via /reset-password later.
function generateTempPassword(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export async function createTenantWithOwner(
  input: CreateTenantInput,
): Promise<CreateTenantResult> {
  // ── Auth + platform-admin gate ──────────────────────────────
  const supa = createServerClient();
  const {
    data: { user: caller },
  } = await supa.auth.getUser();
  if (!caller) return { ok: false, error: 'Not signed in.', code: 'forbidden' };
  if (!isPlatformAdmin(caller.email)) {
    return { ok: false, error: 'Doar administratorii platformei pot crea tenanți noi.', code: 'forbidden' };
  }

  // ── Validate ────────────────────────────────────────────────
  const email = (input.email ?? '').trim().toLowerCase();
  const restaurantName = (input.restaurantName ?? '').trim();
  const slug = (input.slug ?? '').trim().toLowerCase();
  const phone = (input.phone ?? '').trim() || null;

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: 'Email invalid.', code: 'invalid' };
  }
  if (restaurantName.length < 2 || restaurantName.length > 100) {
    return { ok: false, error: 'Nume restaurant: 2-100 caractere.', code: 'invalid' };
  }
  if (slug.length < 3 || slug.length > 30 || !SLUG_RE.test(slug)) {
    return { ok: false, error: 'Slug invalid (3-30 caractere, litere mici / cifre / "-").', code: 'invalid' };
  }
  if (phone && (phone.length < 6 || phone.length > 30)) {
    return { ok: false, error: 'Telefon invalid (6-30 caractere).', code: 'invalid' };
  }

  const admin = createAdminClient();

  // ── Slug uniqueness ─────────────────────────────────────────
  const { data: existingSlug, error: slugErr } = await admin
    .from('tenants')
    .select('id')
    .eq('slug', slug)
    .maybeSingle();
  if (slugErr) {
    return { ok: false, error: slugErr.message, code: 'tenant_failed' };
  }
  if (existingSlug) {
    return { ok: false, error: 'Slug indisponibil — alege altul.', code: 'slug_taken' };
  }

  // ── Auth user (in-person => email_confirm: true) ────────────
  const tempPassword = generateTempPassword();
  const { data: created, error: authErr } = await admin.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
  });
  if (authErr || !created.user) {
    const msg = authErr?.message ?? 'createUser failed';
    // Generic message for privacy, but tag the code so the UI can show a
    // specific hint when the email already has an account.
    if (/already (registered|exists)|duplicate/i.test(msg)) {
      return { ok: false, error: 'Email deja înregistrat. Folosește un alt email sau adaugă-l manual ca membru.', code: 'email_taken' };
    }
    console.error('[admin/onboard] auth.createUser failed', msg);
    return { ok: false, error: 'Nu am putut crea utilizatorul.', code: 'auth_failed' };
  }
  const ownerUserId = created.user.id;

  // ── Tenant row ──────────────────────────────────────────────
  const initialSettings: Record<string, unknown> = {
    onboarding_meta: {
      created_via: 'platform_admin_in_person',
      created_by_email: caller.email,
      patron_phone: phone,
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: tenantRow, error: tenantErr } = await (admin as any)
    .from('tenants')
    .insert({
      name: restaurantName,
      slug,
      status: 'ACTIVE',
      vertical: 'RESTAURANT',
      settings: initialSettings,
    })
    .select('id')
    .single();
  if (tenantErr || !tenantRow) {
    await admin.auth.admin.deleteUser(ownerUserId);
    console.error('[admin/onboard] tenant insert failed', tenantErr?.message);
    return { ok: false, error: tenantErr?.message ?? 'tenant insert failed', code: 'tenant_failed' };
  }
  const tenantId = tenantRow.id as string;

  // ── Membership rows: patron (OWNER) + caller (OWNER, co-owner)
  // The caller is added as co-OWNER so he can switch into the tenant from
  // his own session and drive master-key import + branding + go-live.
  const { error: ownerMemberErr } = await admin
    .from('tenant_members')
    .insert([
      { tenant_id: tenantId, user_id: ownerUserId, role: 'OWNER' },
      { tenant_id: tenantId, user_id: caller.id, role: 'OWNER' },
    ]);
  if (ownerMemberErr) {
    await admin.from('tenants').delete().eq('id', tenantId);
    await admin.auth.admin.deleteUser(ownerUserId);
    console.error('[admin/onboard] tenant_members insert failed', ownerMemberErr.message);
    return { ok: false, error: ownerMemberErr.message, code: 'member_failed' };
  }

  // ── Default delivery tier (mirrors /api/signup behaviour) ────
  const { error: tierErr } = await admin
    .from('delivery_pricing_tiers')
    .insert({
      tenant_id: tenantId,
      min_km: 0,
      max_km: 15,
      price_ron: 15,
      sort_order: 0,
    });
  if (tierErr) {
    console.warn('[admin/onboard] default tier insert failed (non-fatal)', tierErr.message);
  }

  // ── Audit ───────────────────────────────────────────────────
  void logAudit({
    tenantId,
    actorUserId: caller.id,
    action: 'tenant.created',
    entityType: 'tenant',
    entityId: tenantId,
    metadata: {
      slug,
      patron_email: email,
      patron_phone: phone,
      created_via: 'platform_admin_in_person',
    },
  });

  const primaryDomain = process.env.NEXT_PUBLIC_PRIMARY_DOMAIN || 'hiraisolutions.ro';
  const storefrontUrl = `https://${slug}.${primaryDomain}`;

  return {
    ok: true,
    tenantId,
    ownerUserId,
    slug,
    tempPassword,
    storefrontUrl,
  };
}

// Switch the calling user's TENANT_COOKIE to the freshly created tenant so
// /dashboard/onboarding/migrate-from-gloriafood/master-key, branding, and
// go-live all operate on it. Caller has already been added as OWNER above.
export async function switchToTenantAction(formData: FormData): Promise<void> {
  const tenantId = String(formData.get('tenantId') ?? '');
  if (!tenantId) throw new Error('missing_tenant_id');

  const supa = createServerClient();
  const {
    data: { user },
  } = await supa.auth.getUser();
  if (!user) throw new Error('unauthenticated');
  if (!isPlatformAdmin(user.email)) throw new Error('forbidden');

  // Verify membership — admin client because we just inserted the row above
  // and the cookie session may not have refreshed yet.
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('tenant_members')
    .select('tenant_id')
    .eq('tenant_id', tenantId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('not_a_member');

  cookies().set(TENANT_COOKIE, tenantId, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
}
