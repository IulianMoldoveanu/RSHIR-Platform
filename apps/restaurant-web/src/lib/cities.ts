// Lane STOREFRONT-CITY-LANDING (2026-05-06) — read-only helpers around the
// canonical `cities` table for the public marketing site.
//
// Uses a plain `createClient` with the anon key (NOT `getSupabase()` which
// reads cookies()) so it can be called from `generateStaticParams` and ISR
// data-collection phases. Both `cities` and `tenants` (status=ACTIVE) are
// readable via anon RLS policies.
//
// New tenants set `tenants.city_id` from the onboarding wizard. Legacy
// tenants still carry the city as free-text in `settings.city`. The page
// query resolves both: prefers `city_id` match, falls back to
// case-insensitive lower-match against `settings.city`.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let cachedAnonClient: SupabaseClient | null = null;

// Returns `null` (not throws) when Supabase env is missing. The build phase
// runs `generateStaticParams` without the production env wired up; we want
// the build to succeed and fall back to `dynamicParams = true` so Vercel
// renders /orase/<slug> on first request once env is in place.
function getAnonClient(): SupabaseClient | null {
  if (cachedAnonClient) return cachedAnonClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return null;
  }
  cachedAnonClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cachedAnonClient;
}

export type CityRow = {
  id: string;
  name: string;
  slug: string;
  county: string | null;
  sort_order: number;
};

// Tenant card payload — minimum needed to render a listing card on a
// city landing page. Branding lives inside `settings`; we pull only the
// settings JSON and the caller extracts the bits it needs via brandingFor().
export type TenantCardRow = {
  id: string;
  slug: string;
  name: string;
  custom_domain: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  settings: any;
  created_at: string | null;
};

/**
 * List every active city in canonical sort order. Used by the `/orase`
 * index page and by `generateStaticParams` of `/orase/[citySlug]`.
 */
export async function listActiveCities(): Promise<CityRow[]> {
  const supabase = getAnonClient();
  if (!supabase) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;
  const { data, error } = await sb
    .from('cities')
    .select('id, name, slug, county, sort_order')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });
  if (error) {
    console.error('[cities] listActiveCities failed', error.message);
    return [];
  }
  return (data ?? []) as CityRow[];
}

/**
 * Look up one active city by slug. Returns null when the slug is unknown
 * or the row is inactive — the page should `notFound()` in that case.
 */
export async function getCityBySlug(slug: string): Promise<CityRow | null> {
  const supabase = getAnonClient();
  if (!supabase) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;
  const { data, error } = await sb
    .from('cities')
    .select('id, name, slug, county, sort_order')
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle();
  if (error) {
    console.error('[cities] getCityBySlug failed', error.message);
    return null;
  }
  return (data ?? null) as CityRow | null;
}

/**
 * List ACTIVE tenants for a city. Resolves both the canonical FK
 * (`tenants.city_id = city.id`) and the legacy free-text fallback
 * (`tenants.settings->>city` matches city name case-insensitively).
 *
 * Returned list is de-duplicated by id, capped at `limit`, ordered by
 * created_at descending so newly-onboarded tenants surface first.
 */
export async function listTenantsByCity(
  city: CityRow,
  limit = 50,
): Promise<TenantCardRow[]> {
  const supabase = getAnonClient();
  if (!supabase) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;

  // 1. Canonical match via city_id.
  const { data: byFk, error: fkErr } = await sb
    .from('v_tenants_storefront')
    .select('id, slug, name, custom_domain, settings, created_at')
    .eq('status', 'ACTIVE')
    .eq('city_id', city.id)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (fkErr) {
    console.error('[cities] listTenantsByCity fk lookup failed', fkErr.message);
  }

  // 2. Legacy free-text match — only fetch if we still have headroom.
  const fkRows = (byFk ?? []) as TenantCardRow[];
  const remaining = Math.max(0, limit - fkRows.length);
  let legacyRows: TenantCardRow[] = [];
  if (remaining > 0) {
    const { data: byText, error: textErr } = await sb
      .from('v_tenants_storefront')
      .select('id, slug, name, custom_domain, settings, created_at')
      .eq('status', 'ACTIVE')
      .is('city_id', null)
      // settings->>city is plain text; ilike covers casing + diacritic
      // mistakes that the free-text era allowed (e.g. "brasov" / "Brașov").
      .ilike('settings->>city', city.name)
      .order('created_at', { ascending: false })
      .limit(remaining);
    if (textErr) {
      console.error('[cities] listTenantsByCity text lookup failed', textErr.message);
    }
    legacyRows = (byText ?? []) as TenantCardRow[];
  }

  // De-dupe defensively in case a row matched both queries.
  const seen = new Set<string>();
  const merged: TenantCardRow[] = [];
  for (const row of [...fkRows, ...legacyRows]) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    merged.push(row);
    if (merged.length >= limit) break;
  }
  return merged;
}

/**
 * Lightweight count per city for the `/orase` index page. Single round-trip
 * via head-only count queries; falls back to 0 on error so the index always
 * renders.
 */
export async function countActiveTenantsForCity(city: CityRow): Promise<number> {
  const supabase = getAnonClient();
  if (!supabase) return 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;
  const { count: fkCount } = await sb
    .from('v_tenants_storefront')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'ACTIVE')
    .eq('city_id', city.id);
  const { count: textCount } = await sb
    .from('v_tenants_storefront')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'ACTIVE')
    .is('city_id', null)
    .ilike('settings->>city', city.name);
  return (fkCount ?? 0) + (textCount ?? 0);
}
