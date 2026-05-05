import type { MetadataRoute } from 'next';
import { headers } from 'next/headers';
import { resolveTenantFromHost, tenantBaseUrl } from '@/lib/tenant';
import { getSupabase } from '@/lib/supabase';
import { buildItemSlug } from '@/lib/slug';
import {
  MARKETING_ROUTES,
  canonicalBaseUrl,
  isCanonicalHost,
  tenantCanonicalUrl,
} from '@/lib/seo-marketing';

export const dynamic = 'force-dynamic';

type ItemRow = { id: string; name: string; updated_at: string | null };
type ActiveTenantRow = {
  slug: string;
  custom_domain: string | null;
  updated_at: string | null;
};

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { tenant } = await resolveTenantFromHost();
  const supabase = getSupabase();
  const now = new Date();

  // CASE 1 — request hit a tenant host. Emit the existing tenant sitemap
  // (homepage + bio + privacy + every available menu item).
  if (tenant) {
    const baseUrl = tenantBaseUrl();
    const { data } = await supabase
      .from('restaurant_menu_items')
      .select('id, name, updated_at')
      .eq('tenant_id', tenant.id)
      .eq('is_available', true);

    const items = (data ?? []) as ItemRow[];
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

  // CASE 2 — request hit the canonical/marketing host (no tenant resolved).
  // Emit marketing pages + 1 entry per ACTIVE tenant landing so search
  // engines crawl every live restaurant from a single sitemap submission.
  const host =
    headers().get('x-hir-host') ??
    headers().get('host')?.split(':')[0] ??
    '';
  if (!isCanonicalHost(host)) {
    // Unknown host (e.g. raw IP, preview branch URL) — return empty rather
    // than guess. Lane H's marketing pages still render on canonical hosts.
    return [];
  }

  const baseUrl = canonicalBaseUrl(host);
  // Lane EN-I18N PR D — emit `<xhtml:link>` alternates for every marketing
  // route. Cookie-based locale means the same URL serves RO + EN, so all
  // alternates self-reference. Helps GSC understand we serve a bilingual
  // page from a single canonical without duplicate-content penalties.
  const marketingEntries: MetadataRoute.Sitemap = MARKETING_ROUTES.map((r) => {
    const url = `${baseUrl}${r.path}`;
    return {
      url,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: r.priority,
      alternates: {
        languages: { 'ro-RO': url, en: url, 'x-default': url },
      },
    };
  });

  // Per-active-tenant landing entry. Crawl daily-ish (changefreq weekly)
  // because menu + hours + prices change frequently. lastMod from
  // tenants.updated_at — bumped on any settings/menu mutation.
  const { data: tenants } = await supabase
    .from('tenants')
    .select('slug, custom_domain, updated_at')
    .eq('status', 'ACTIVE');

  const tenantEntries: MetadataRoute.Sitemap = ((tenants ?? []) as ActiveTenantRow[]).map((t) => ({
    url: tenantCanonicalUrl(t),
    lastModified: t.updated_at ? new Date(t.updated_at) : now,
    changeFrequency: 'weekly',
    priority: 0.8,
  }));

  return [...marketingEntries, ...tenantEntries];
}
