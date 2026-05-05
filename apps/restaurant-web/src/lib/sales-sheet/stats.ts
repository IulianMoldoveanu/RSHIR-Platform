import 'server-only';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

// Lane W — sales-sheet PDF stats helper.
//
// Live numbers we surface on the auto-generated 1-pager Iulian DMs to
// fleet managers / restaurant owners post-meeting. Numbers MUST be honest
// — no inflation, no fallbacks-with-fake-data. If a query fails we show
// "—" rather than a fabricated stat.

export type SalesSheetStats = {
  activeTenants: number | null;
  liveCities: number | null;
  ordersLast30Days: number | null;
  generatedAt: string; // ISO
};

const CACHE_TTL_MS = 60_000; // 60s — enough to survive a partner clicking
                              // download a few times in a row, short enough
                              // to reflect a freshly-onboarded tenant.

let cache: { value: SalesSheetStats; expiresAt: number } | null = null;

export async function getSalesSheetStats(): Promise<SalesSheetStats> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) return cache.value;

  const admin = getSupabaseAdmin();

  // 3 independent counts in parallel. Failures are isolated — if cities
  // breaks (say, RLS on customer_addresses tightens later) we still ship
  // the PDF with the other two stats.
  const [tenantsRes, citiesRes, ordersRes] = await Promise.allSettled([
    admin
      .from('tenants')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active'),
    // We don't have tenants.city. Distinct cities served = distinct city
    // values across customer addresses tied to active orders. Approximation
    // good enough for a sales sheet: if HIR has shipped to 3 different
    // cities, that's 3 live cities.
    admin
      .from('customer_addresses')
      .select('city', { count: 'exact', head: false })
      .limit(1000),
    admin
      .from('restaurant_orders')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', new Date(now - 30 * 24 * 3600 * 1000).toISOString()),
  ]);

  const activeTenants =
    tenantsRes.status === 'fulfilled' && !tenantsRes.value.error
      ? tenantsRes.value.count ?? 0
      : null;

  let liveCities: number | null = null;
  if (citiesRes.status === 'fulfilled' && !citiesRes.value.error) {
    const rows = (citiesRes.value.data ?? []) as Array<{ city: string | null }>;
    const set = new Set<string>();
    for (const r of rows) {
      if (r.city && typeof r.city === 'string') {
        set.add(r.city.trim().toLowerCase());
      }
    }
    liveCities = set.size;
  }

  const ordersLast30Days =
    ordersRes.status === 'fulfilled' && !ordersRes.value.error
      ? ordersRes.value.count ?? 0
      : null;

  const value: SalesSheetStats = {
    activeTenants,
    liveCities,
    ordersLast30Days,
    generatedAt: new Date().toISOString(),
  };
  cache = { value, expiresAt: now + CACHE_TTL_MS };
  return value;
}

/** Test-only: drop the in-memory cache. */
export function __resetSalesSheetStatsCache() {
  cache = null;
}
