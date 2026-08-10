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
import { friendlyDbError } from '@/lib/db-error';
import { isPlatformAdminEmail as isPlatformAdmin } from '@/lib/auth/platform-admin';
import { loadGridData } from '@/lib/fleet-allocation/queries';
import { findCoverageGaps } from '@/lib/fleet-allocation/coverage';

export async function openTenantAsPlatformAdmin(formData: FormData): Promise<void> {
  const tenantId = String(formData.get('tenantId') ?? '');
  if (!tenantId) throw new Error('missing_tenant_id');

  const supa = await createServerClient();
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
  if (error) throw friendlyDbError(error, 'verificarea restaurantului');
  if (!data) throw new Error('tenant_not_found');

  const cookieStore = await cookies();
  cookieStore.set(TENANT_COOKIE, tenantId, {
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

  const supa = await createServerClient();
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

// Lane ADMIN-POLISH-V1: Suspend / reactivate a tenant from the platform-admin
// list. Toggle between `tenants.status = 'ACTIVE'` and `'SUSPENDED'`. The
// `'ONBOARDING'` state is intentionally untouched — onboarding tenants haven't
// gone live yet and shouldn't be auto-flipped to ACTIVE through this action.
//
// Audit-logged via `tenant.suspended` / `tenant.reactivated`. No schema
// migration: the status enum already includes SUSPENDED (initial migration
// 20260425_000_initial.sql).
export async function setTenantStatus(args: {
  tenantId: string;
  next: 'ACTIVE' | 'SUSPENDED';
}): Promise<{ ok: true; status: 'ACTIVE' | 'SUSPENDED' } | { ok: false; error: string }> {
  if (!args.tenantId) return { ok: false, error: 'invalid_input' };
  if (args.next !== 'ACTIVE' && args.next !== 'SUSPENDED') {
    return { ok: false, error: 'invalid_status' };
  }

  const supa = await createServerClient();
  const {
    data: { user },
  } = await supa.auth.getUser();
  if (!user) return { ok: false, error: 'unauthenticated' };
  if (!isPlatformAdmin(user.email)) return { ok: false, error: 'forbidden' };

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any;

  const { data: tenant, error: tErr } = await sb
    .from('tenants')
    .select('id, name, status')
    .eq('id', args.tenantId)
    .maybeSingle();
  if (tErr) return { ok: false, error: tErr.message };
  if (!tenant) return { ok: false, error: 'tenant_not_found' };

  // ONBOARDING → ACTIVE is the go-live step, and it is gated on somebody being
  // able to deliver. A vendor whose fleet has no couriers takes orders that are
  // accepted, cooked and then never offered to anyone — found by the 2026-08-10
  // load test, and the reason onboardTenant now parks uncovered vendors in
  // ONBOARDING instead of publishing them straight to ACTIVE.
  //
  // The check reuses findCoverageGaps, the same function the fleet-allocation
  // grid draws its warning from, so the button and the banner can never
  // disagree. ONBOARDING → SUSPENDED stays refused: there is nothing live to
  // suspend.
  if (tenant.status === 'ONBOARDING') {
    if (args.next !== 'ACTIVE') return { ok: false, error: 'tenant_in_onboarding' };
    try {
      const grid = await loadGridData();
      // findCoverageGaps only inspects ACTIVE tenants, so an ONBOARDING one is
      // never in its output. Ask it about this tenant as if it were already
      // live — that is exactly the question "is it safe to go live?".
      const gap = findCoverageGaps({
        ...grid,
        restaurants: grid.restaurants.map((r) =>
          r.id === args.tenantId ? { ...r, status: 'ACTIVE' } : r,
        ),
      }).find((g) => g.tenantId === args.tenantId);
      if (gap) {
        return {
          ok: false,
          error:
            gap.reason === 'assigned_fleet_has_no_couriers'
              ? 'no_couriers_in_assigned_fleet'
              : 'no_fleet_assigned',
        };
      }
    } catch (err) {
      // Fail closed: if we cannot prove coverage, we do not publish a vendor
      // whose orders might never reach a courier.
      return { ok: false, error: `coverage_check_failed: ${(err as Error).message}` };
    }
  }
  if (tenant.status === args.next) {
    // Idempotent — re-clicking the same action is a no-op, not an error.
    return { ok: true, status: args.next };
  }

  const { error: wErr } = await sb
    .from('tenants')
    .update({ status: args.next })
    .eq('id', args.tenantId);
  if (wErr) return { ok: false, error: wErr.message };

  void logAudit({
    tenantId: args.tenantId,
    actorUserId: user.id,
    action: args.next === 'SUSPENDED' ? 'tenant.suspended' : 'tenant.reactivated',
    entityType: 'tenant',
    entityId: args.tenantId,
    metadata: {
      previous_status: tenant.status,
      new_status: args.next,
      tenant_name: tenant.name,
    },
  });

  revalidatePath('/dashboard/admin/tenants');
  return { ok: true, status: args.next };
}
