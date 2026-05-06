// Lane MULTI-CITY: helpers around the canonical `cities` table.
//
// Shared between the onboarding wizard and the platform-admin pages so a
// single query shape (active + sort_order) populates every dropdown.

import { createAdminClient } from '@/lib/supabase/admin';

export type CityRow = {
  id: string;
  name: string;
  slug: string;
  county: string | null;
  sort_order: number;
};

// Fetch active cities ordered for dropdowns. Cached per-request via Next's
// route segment cache (the caller decides revalidation through dynamic).
export async function listActiveCities(): Promise<CityRow[]> {
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any;
  const { data, error } = await sb
    .from('cities')
    .select('id, name, slug, county, sort_order')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });
  if (error) {
    // Soft-fail: an empty list lets the UI fall back to free-text.
    console.error('[cities] listActiveCities failed', error.message);
    return [];
  }
  return (data ?? []) as CityRow[];
}
