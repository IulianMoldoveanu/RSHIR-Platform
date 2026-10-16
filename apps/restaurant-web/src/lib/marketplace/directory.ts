// Lane HIRforYOU-MARKETPLACE (2026-05-28) — read-only helpers for the
// consumer marketplace directory.
//
// Queries are anon-key-only (the data is fully public — only opt-in tenants
// with aggregator_visibility='public' surface here) so they run from
// `generateStaticParams` and ISR data-collection without auth cookies.
//
// All reads go through the `marketplace_directory` materialized view which
// pre-aggregates rating + 30-day order counts. The view is refreshed
// nightly by the cron in `refresh_marketplace_directory()`.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let cachedAnonClient: SupabaseClient | null = null;

// Returns `null` (not throws) when env is missing — keeps Vercel build phase
// happy and lets ISR fall back to runtime rendering on first request.
function getAnonClient(): SupabaseClient | null {
  if (cachedAnonClient) return cachedAnonClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  cachedAnonClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cachedAnonClient;
}

export type DirectoryRow = {
  tenant_id: string;
  slug: string;
  name: string;
  custom_domain: string | null;
  logo_url: string | null;
  tagline: string | null;
  restaurant_type: string | null;
  city_id: string | null;
  city_slug: string | null;
  city_name: string | null;
  avg_rating: number;
  review_count: number;
  orders_last_30d: number;
  aggregator_enabled: boolean;
  aggregator_visibility: 'private' | 'public' | 'invite_only';
};

export type DirectoryFilters = {
  citySlug?: string | null;
  minRating?: number | null;
  restaurantType?: string | null;
  limit?: number;
  offset?: number;
};

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 60;

/**
 * Page-size-bounded list of public marketplace restaurants.
 * Always returns an array (empty when env missing or no rows match).
 */
export async function listDirectory(filters: DirectoryFilters = {}): Promise<DirectoryRow[]> {
  const supabase = getAnonClient();
  if (!supabase) return [];

  const limit = Math.min(Math.max(1, filters.limit ?? DEFAULT_LIMIT), MAX_LIMIT);
  const offset = Math.max(0, filters.offset ?? 0);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = (supabase as any)
    .from('marketplace_directory')
    .select(
      'tenant_id, slug, name, custom_domain, logo_url, tagline, restaurant_type, city_id, city_slug, city_name, avg_rating, review_count, orders_last_30d, aggregator_enabled, aggregator_visibility',
    )
    .order('orders_last_30d', { ascending: false })
    .order('avg_rating', { ascending: false })
    .range(offset, offset + limit - 1);

  if (filters.citySlug) {
    q = q.eq('city_slug', filters.citySlug);
  }
  if (filters.minRating != null && filters.minRating > 0) {
    q = q.gte('avg_rating', filters.minRating);
  }
  if (filters.restaurantType) {
    q = q.eq('restaurant_type', filters.restaurantType);
  }

  const { data, error } = await q;
  if (error) {
    console.error('[marketplace] listDirectory failed', error.message);
    return [];
  }
  return (data ?? []) as DirectoryRow[];
}

/**
 * Count of rows matching the filters (without limit/offset) — used to drive
 * pagination. Head-only query for cheap counts.
 */
export async function countDirectory(filters: DirectoryFilters = {}): Promise<number> {
  const supabase = getAnonClient();
  if (!supabase) return 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = (supabase as any)
    .from('marketplace_directory')
    .select('tenant_id', { count: 'exact', head: true });
  if (filters.citySlug) q = q.eq('city_slug', filters.citySlug);
  if (filters.minRating != null && filters.minRating > 0) q = q.gte('avg_rating', filters.minRating);
  if (filters.restaurantType) q = q.eq('restaurant_type', filters.restaurantType);
  const { count, error } = await q;
  if (error) {
    console.error('[marketplace] countDirectory failed', error.message);
    return 0;
  }
  return count ?? 0;
}

/**
 * Resolve a single directory row by (city_slug, tenant_slug). Used by
 * `/restaurante/[oras]/[slug]` to render the restaurant detail page.
 */
export async function getDirectoryEntry(
  citySlug: string,
  tenantSlug: string,
): Promise<DirectoryRow | null> {
  const supabase = getAnonClient();
  if (!supabase) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;
  const { data, error } = await sb
    .from('marketplace_directory')
    .select(
      'tenant_id, slug, name, custom_domain, logo_url, tagline, restaurant_type, city_id, city_slug, city_name, avg_rating, review_count, orders_last_30d, aggregator_enabled, aggregator_visibility',
    )
    .eq('city_slug', citySlug)
    .eq('slug', tenantSlug)
    .maybeSingle();
  if (error) {
    console.error('[marketplace] getDirectoryEntry failed', error.message);
    return null;
  }
  return (data ?? null) as DirectoryRow | null;
}

/**
 * Distinct list of cities that have at least one public marketplace tenant.
 * Used to filter the city dropdown in the directory UI.
 */
export async function listMarketplaceCities(): Promise<
  Array<{ slug: string; name: string; count: number }>
> {
  const supabase = getAnonClient();
  if (!supabase) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;
  const { data, error } = await sb
    .from('marketplace_directory')
    .select('city_slug, city_name');
  if (error) {
    console.error('[marketplace] listMarketplaceCities failed', error.message);
    return [];
  }
  const rows = (data ?? []) as Array<{ city_slug: string | null; city_name: string | null }>;
  const counts = new Map<string, { name: string; count: number }>();
  for (const r of rows) {
    if (!r.city_slug || !r.city_name) continue;
    const existing = counts.get(r.city_slug);
    if (existing) {
      existing.count += 1;
    } else {
      counts.set(r.city_slug, { name: r.city_name, count: 1 });
    }
  }
  return Array.from(counts.entries())
    .map(([slug, { name, count }]) => ({ slug, name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/**
 * Latest reviews for a tenant — used on `/restaurante/[oras]/[slug]` detail
 * page. Returns up to `limit` rows, newest first. Anon-readable per RLS.
 */
export type ReviewRow = {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  full_name: string | null;
};

export async function listLatestReviews(
  tenantId: string,
  limit = 10,
): Promise<ReviewRow[]> {
  const supabase = getAnonClient();
  if (!supabase) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;
  const { data, error } = await sb
    .from('marketplace_reviews')
    .select(
      'id, rating, comment, created_at, marketplace_customers ( full_name )',
    )
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(Math.min(Math.max(1, limit), 50));
  if (error) {
    console.error('[marketplace] listLatestReviews failed', error.message);
    return [];
  }
  // Flatten the nested marketplace_customers shape so callers get a clean
  // ReviewRow. We deliberately do NOT leak email/phone — only the public
  // display name (full_name). RLS is the authoritative guard, this is
  // a belt-and-suspenders projection.
  return (data ?? []).map((row: {
    id: string;
    rating: number;
    comment: string | null;
    created_at: string;
    marketplace_customers: { full_name: string | null } | null;
  }) => ({
    id: row.id,
    rating: row.rating,
    comment: row.comment,
    created_at: row.created_at,
    full_name: row.marketplace_customers?.full_name ?? null,
  }));
}

/**
 * Eligibility heuristic for surfacing tenants in the public directory.
 * Documented in the admin settings UI so OWNERs understand the criteria:
 *   - aggregator_enabled = true
 *   - aggregator_visibility = 'public'
 *   - at least 1 review OR at least 10 orders in last 30 days
 * The materialized view already filters on the first two; this helper
 * lets the admin settings page show a "you are eligible" badge.
 */
export function isEligibleForPublicDirectory(row: {
  review_count: number;
  orders_last_30d: number;
}): boolean {
  return row.review_count >= 1 || row.orders_last_30d >= 10;
}
