import { getSupabase } from '@/lib/supabase';
import type { ResolvedTenant, TenantSettings } from '@/lib/tenant';

// Fixed slug for the interactive marketing-site demo storefront
// (`/demo-storefront`). Deliberately NOT routed through
// `resolveTenantFromHost()` — that resolver's `?tenant=` override is
// host-gated to exclude production canonical domains on purpose (real
// tenant-switching protection), and this route must render the same fixed
// demo tenant on the real hirforyou.ro production host. So this is its own
// tiny, separate lookup against the same anon-safe view, hardcoded to one
// slug — it can never resolve any other tenant.
const DEMO_TENANT_SLUG = 'restaurant-demo';

type TenantRow = {
  id: string;
  slug: string;
  name: string;
  custom_domain: string | null;
  status: string;
  settings: unknown;
  template_slug: string | null;
};

export async function getDemoTenant(): Promise<ResolvedTenant | null> {
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from('v_tenants_storefront')
    .select('id, slug, name, custom_domain, status, settings, template_slug')
    .eq('slug', DEMO_TENANT_SLUG)
    .maybeSingle();
  if (error || !data) return null;

  const row = data as TenantRow;
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    custom_domain: row.custom_domain,
    status: row.status,
    settings: (row.settings ?? {}) as TenantSettings,
    template_slug: row.template_slug ?? null,
  };
}
