import type { MetadataRoute } from 'next';
import { resolveTenantFromHost, tenantBaseUrl } from '@/lib/tenant';
import { getSupabase } from '@/lib/supabase';
import { buildItemSlug } from '@/lib/slug';

export const dynamic = 'force-dynamic';

type ItemRow = { id: string; name: string; updated_at: string | null };

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { tenant } = await resolveTenantFromHost();
  if (!tenant) return [];

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
