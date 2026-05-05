import type { MetadataRoute } from 'next';
import { headers } from 'next/headers';
import { resolveTenantFromHost, tenantBaseUrl } from '@/lib/tenant';
import { getSupabase } from '@/lib/supabase';
import { buildItemSlug } from '@/lib/slug';

export const dynamic = 'force-dynamic';

type ItemRow = { id: string; name: string; updated_at: string | null };

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { tenant } = await resolveTenantFromHost();

  // Lane H 2026-05-04: when no tenant resolves, the host serves the brand
  // marketing site. Emit a canonical sitemap for the marketing surface so
  // search engines can crawl /, /features, /pricing, /case-studies/*, etc.
  if (!tenant) {
    const h = headers();
    const hostWithPort =
      h.get('x-hir-host-with-port') ?? h.get('host') ?? h.get('x-hir-host') ?? '';
    const hostNoPort = hostWithPort.split(':')[0];
    const proto =
      hostNoPort === 'localhost' || hostNoPort.endsWith('.lvh.me') ? 'http' : 'https';
    const base = `${proto}://${hostWithPort}`;
    const now = new Date();
    return [
      { url: `${base}/`, lastModified: now, changeFrequency: 'weekly', priority: 1.0 },
      { url: `${base}/features`, lastModified: now, changeFrequency: 'monthly', priority: 0.9 },
      { url: `${base}/pricing`, lastModified: now, changeFrequency: 'monthly', priority: 0.9 },
      { url: `${base}/migrate-from-gloriafood`, lastModified: now, changeFrequency: 'weekly', priority: 0.95 },
      { url: `${base}/case-studies/foisorul-a`, lastModified: now, changeFrequency: 'monthly', priority: 0.8 },
      { url: `${base}/contact`, lastModified: now, changeFrequency: 'yearly', priority: 0.6 },
      { url: `${base}/affiliate`, lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
      { url: `${base}/privacy`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
    ];
  }

  const baseUrl = tenantBaseUrl();
  const supabase = getSupabase();
  const { data } = await supabase
    .from('restaurant_menu_items')
    .select('id, name, updated_at')
    .eq('tenant_id', tenant.id)
    .eq('is_available', true);

  const items = (data ?? []) as ItemRow[];
  const now = new Date();

  const itemEntries: MetadataRoute.Sitemap = items.map((it) => ({
    url: `${baseUrl}/m/${buildItemSlug(it)}`,
    lastModified: it.updated_at ? new Date(it.updated_at) : now,
    changeFrequency: 'weekly',
    priority: 0.7,
  }));

  return [
    {
      url: `${baseUrl}/`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 1.0,
    },
    {
      url: `${baseUrl}/bio`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/privacy`,
      lastModified: now,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    ...itemEntries,
  ];
}
