import { headers } from 'next/headers';
import { getSupabase } from './supabase';

export type ResolvedTenant = {
  id: string;
  slug: string;
  name: string;
  custom_domain: string | null;
  status: string;
};

/**
 * Resolves the active tenant for the current request from the host header.
 * Lookup order:
 *   1. exact match on `tenants.custom_domain`
 *   2. fallback to leading subdomain → `tenants.slug`
 *
 * Returns null if no tenant matches; the caller is expected to render not-found.
 */
export async function resolveTenantFromHost(): Promise<{
  tenant: ResolvedTenant | null;
  host: string;
  slug: string;
}> {
  const h = headers();
  const host = h.get('x-hir-host') ?? h.get('host')?.split(':')[0] ?? '';
  const slug = h.get('x-hir-tenant-slug') ?? host.split('.')[0];

  const supabase = getSupabase();

  // 1) try custom_domain
  let { data: tenant } = await supabase
    .from('tenants')
    .select('id, slug, name, custom_domain, status')
    .eq('custom_domain', host)
    .maybeSingle();

  // 2) fall back to slug
  if (!tenant && slug) {
    const res = await supabase
      .from('tenants')
      .select('id, slug, name, custom_domain, status')
      .eq('slug', slug)
      .maybeSingle();
    tenant = res.data ?? null;
  }

  return { tenant: tenant ?? null, host, slug };
}
