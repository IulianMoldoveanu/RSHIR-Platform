import type { MetadataRoute } from 'next';
import { resolveTenantFromHost, brandingFor } from '@/lib/tenant';

// Next.js App Router special file — runs per-request (Node runtime),
// so resolveTenantFromHost() / headers() work correctly.
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  let name = 'HIR Restaurant';
  let themeColor = '#7c3aed';
  // /icon-192.png + /icon-512.png ship under apps/restaurant-web/public/
  // (HIR-branded PNG, shared with restaurant-courier). Per-tenant logos
  // override these below when `branding.logo_url` is set on the tenant.
  let iconSrc192 = '/icon-192.png';
  let iconSrc512 = '/icon-512.png';

  try {
    const { tenant } = await resolveTenantFromHost();
    if (tenant) {
      name = tenant.name;
      const { logoUrl, brandColor } = brandingFor(tenant.settings);
      themeColor = brandColor;
      if (logoUrl) {
        iconSrc192 = logoUrl;
        iconSrc512 = logoUrl;
      }
    }
  } catch {
    // resolveTenantFromHost throws when called outside a request context
    // (e.g. next build static analysis). Fall back to HIR defaults.
  }

  const shortName = name.slice(0, 12);

  return {
    name,
    short_name: shortName,
    start_url: '/',
    display: 'standalone',
    theme_color: themeColor,
    background_color: '#ffffff',
    icons: [
      { src: iconSrc192, sizes: '192x192', type: 'image/png' },
      { src: iconSrc512, sizes: '512x512', type: 'image/png' },
    ],
  };
}
