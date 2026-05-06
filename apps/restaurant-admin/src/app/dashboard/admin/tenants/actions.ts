'use server';

// Platform-admin "open tenant" — switches the TENANT_COOKIE so the next
// /dashboard render scopes to the chosen tenant. Unlike onboard/actions.ts
// switchToTenantAction (which requires the caller to be a tenant_member),
// this is for HIR_PLATFORM_ADMIN_EMAILS-allowed users who are NOT members
// of every tenant on the platform. The allow-list itself is the auth.

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { TENANT_COOKIE } from '@/lib/tenant';
import { logAudit } from '@/lib/audit';

function isPlatformAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  const allow = (process.env.HIR_PLATFORM_ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return allow.includes(email.toLowerCase());
}

export async function openTenantAsPlatformAdmin(formData: FormData): Promise<void> {
  const tenantId = String(formData.get('tenantId') ?? '');
  if (!tenantId) throw new Error('missing_tenant_id');

  const supa = createServerClient();
  const {
    data: { user },
  } = await supa.auth.getUser();
  if (!user) throw new Error('unauthenticated');
  if (!isPlatformAdmin(user.email)) throw new Error('forbidden');

  // Verify the tenant exists (defensive — prevents setting cookie to a bogus uuid).
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any;
  const { data, error } = await sb
    .from('tenants')
    .select('id')
    .eq('id', tenantId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('tenant_not_found');

  cookies().set(TENANT_COOKIE, tenantId, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });

  redirect('/dashboard');
}

// Lane MULTI-CITY: assign a canonical city to a tenant from the platform-admin
// inline action. Replaces the legacy free-text in `settings.city` with the
// canonical name AND sets `tenants.city_id` so future filters do FK joins.
//
// Idempotent — running twice on the same tenant with the same slug is a noop.
// Audited via `tenant.city_assigned`.
export async function setTenantCity(args: {
  tenantId: string;
  citySlug: string;
}): Promise<{ ok: true; cityName: string } | { ok: false; error: string }> {
  if (!args.tenantId || !args.citySlug) {
    return { ok: false, error: 'invalid_input' };
  }

  const supa = createServerClient();
  const {
    data: { user },
  } = await supa.auth.getUser();
  if (!user) return { ok: false, error: 'unauthenticated' };
  if (!isPlatformAdmin(user.email)) return { ok: false, error: 'forbidden' };

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any;

  // 1. Resolve city by slug.
  const { data: city, error: cErr } = await sb
    .from('cities')
    .select('id, name, slug, is_active')
    .eq('slug', args.citySlug)
    .maybeSingle();
  if (cErr) return { ok: false, error: cErr.message };
  if (!city || city.is_active === false) {
    return { ok: false, error: 'city_not_found' };
  }

  // 2. Read existing settings so we can update the legacy `city` text in
  //    place (keeps display code that still reads settings.city working).
  const { data: tenant, error: tErr } = await sb
    .from('tenants')
    .select('id, settings')
    .eq('id', args.tenantId)
    .maybeSingle();
  if (tErr) return { ok: false, error: tErr.message };
  if (!tenant) return { ok: false, error: 'tenant_not_found' };

  const settings = (tenant.settings as Record<string, unknown> | null) ?? {};
  const nextSettings = { ...settings, city: city.name };

  const { error: wErr } = await sb
    .from('tenants')
    .update({ city_id: city.id, settings: nextSettings })
    .eq('id', args.tenantId);
  if (wErr) return { ok: false, error: wErr.message };

  void logAudit({
    tenantId: args.tenantId,
    actorUserId: user.id,
    action: 'tenant.city_assigned',
    entityType: 'tenant',
    entityId: args.tenantId,
    metadata: { city_id: city.id, city_slug: city.slug, city_name: city.name },
  });

  revalidatePath('/dashboard/admin/tenants');
  return { ok: true, cityName: city.name };
}
