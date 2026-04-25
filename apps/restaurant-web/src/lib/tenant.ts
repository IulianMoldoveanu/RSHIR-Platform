import { headers } from 'next/headers';
import type { Json } from '@hir/supabase-types';
import { getSupabase } from './supabase';

export type TenantSettings = {
  logo_url?: string | null;
  cover_url?: string | null;
  whatsapp_phone?: string | null;
  bio_item_ids?: string[];
};

export type ResolvedTenant = {
  id: string;
  slug: string;
  name: string;
  custom_domain: string | null;
  status: string;
  settings: TenantSettings;
};

type TenantRow = {
  id: string;
  slug: string;
  name: string;
  custom_domain: string | null;
  status: string;
  settings: Json;
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
  const SELECT = 'id, slug, name, custom_domain, status, settings';

  let row = (
    await supabase.from('tenants').select(SELECT).eq('custom_domain', host).maybeSingle()
  ).data as TenantRow | null;

  if (!row && slug) {
    row = (await supabase.from('tenants').select(SELECT).eq('slug', slug).maybeSingle())
      .data as TenantRow | null;
  }

  if (!row) return { tenant: null, host, slug };

  const settings = (row.settings ?? {}) as TenantSettings;
  return {
    tenant: {
      id: row.id,
      slug: row.slug,
      name: row.name,
      custom_domain: row.custom_domain,
      status: row.status,
      settings,
    },
    host,
    slug,
  };
}

export function tenantBaseUrl(): string {
  const h = headers();
  const hostWithPort =
    h.get('x-hir-host-with-port') ?? h.get('host') ?? h.get('x-hir-host') ?? '';
  const hostNoPort = hostWithPort.split(':')[0];
  const proto =
    hostNoPort === 'localhost' || hostNoPort.endsWith('.lvh.me') ? 'http' : 'https';
  return `${proto}://${hostWithPort}`;
}
