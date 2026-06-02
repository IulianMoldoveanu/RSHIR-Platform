'use server';

// Command Center — city activation control (multi-city national).
//
// `cities.is_active` is the PLATFORM go-live flag, not a courier concern:
//   - the public storefront + sitemap (restaurant-web getActiveCities) show
//     only active cities;
//   - vendor assignment (setTenantCity) refuses an inactive city;
//   - courier/fleet onboarding reads the FULL catalog regardless of the flag
//     (20260630_020), so toggling here never breaks courier flow.
//
// The national catalog (~317 cities) is seeded inactive on purpose; bringing
// HIR live in a city = flipping is_active. Until now that was raw-SQL only.
// These platform-admin actions make it a one-click Command Center operation,
// so Iulian launches the county capitals and expands on demand.
//
// Writes go through the service-role admin client (cities RLS is
// service_role-only for writes); audited to the platform sentinel tenant,
// same convention as fleet-allocation strikes.

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePlatformAdmin } from '@/lib/auth/platform-admin';
import { logAudit } from '@/lib/audit';

const PLATFORM_SENTINEL_TENANT_ID = '00000000-0000-0000-0000-000000000000';

// The 41 county capitals (40 county seats + București, which also serves as
// Ilfov's seat). Matched by slug — ASCII + deterministic, so no diacritic
// drift between this list and the unaccent()-generated catalog slugs. Verified
// against prod: all 41 present. București + 11 launch seats already active.
const COUNTY_CAPITAL_SLUGS = [
  'bucuresti', 'alba-iulia', 'arad', 'pitesti', 'bacau', 'oradea', 'bistrita',
  'botosani', 'brasov', 'braila', 'buzau', 'resita', 'calarasi', 'cluj-napoca',
  'constanta', 'sfantu-gheorghe', 'targoviste', 'craiova', 'galati', 'giurgiu',
  'targu-jiu', 'miercurea-ciuc', 'deva', 'slobozia', 'iasi', 'baia-mare',
  'drobeta-turnu-severin', 'targu-mures', 'piatra-neamt', 'slatina', 'ploiesti',
  'satu-mare', 'zalau', 'sibiu', 'suceava', 'alexandria', 'timisoara', 'tulcea',
  'vaslui', 'ramnicu-valcea', 'focsani',
] as const;

export type CityActionResult =
  | { ok: true; activated?: number }
  | { ok: false; error: string };

function isUuid(v: unknown): v is string {
  return typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminSb = any;

/** Toggle a single city's go-live flag. */
export async function setCityActive(args: {
  cityId: string;
  active: boolean;
}): Promise<CityActionResult> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) {
    return { ok: false, error: auth.status === 401 ? 'Nu sunteți autentificat.' : 'Acces interzis.' };
  }
  if (!isUuid(args.cityId)) {
    return { ok: false, error: 'Oraș invalid.' };
  }

  const sb = createAdminClient() as AdminSb;
  const { data, error } = await sb
    .from('cities')
    .update({ is_active: args.active })
    .eq('id', args.cityId)
    .select('id, name, slug')
    .maybeSingle();
  if (error) {
    console.error('[admin/cities] setCityActive failed', error.message);
    return { ok: false, error: error.message };
  }
  if (!data) return { ok: false, error: 'Oraș inexistent.' };

  void logAudit({
    tenantId: PLATFORM_SENTINEL_TENANT_ID,
    actorUserId: auth.userId,
    action: args.active ? 'city.activated' : 'city.deactivated',
    entityType: 'city',
    entityId: data.id,
    metadata: { slug: data.slug, name: data.name },
  });

  revalidatePath('/dashboard/admin/cities');
  return { ok: true };
}

/**
 * Bulk-activate the 41 county capitals as the national launch baseline.
 * Idempotent — already-active rows are simply re-set to true. Returns how many
 * county-capital rows exist (so the UI can report "41 de capitale active").
 */
export async function activateCountyCapitals(): Promise<CityActionResult> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) {
    return { ok: false, error: auth.status === 401 ? 'Nu sunteți autentificat.' : 'Acces interzis.' };
  }

  const sb = createAdminClient() as AdminSb;
  const { data, error } = await sb
    .from('cities')
    .update({ is_active: true })
    .in('slug', COUNTY_CAPITAL_SLUGS as unknown as string[])
    .select('id');
  if (error) {
    console.error('[admin/cities] activateCountyCapitals failed', error.message);
    return { ok: false, error: error.message };
  }

  const activated = Array.isArray(data) ? data.length : 0;
  void logAudit({
    tenantId: PLATFORM_SENTINEL_TENANT_ID,
    actorUserId: auth.userId,
    action: 'city.activated',
    entityType: 'city',
    metadata: { bulk: 'county_capitals', count: activated },
  });

  revalidatePath('/dashboard/admin/cities');
  return { ok: true, activated };
}
