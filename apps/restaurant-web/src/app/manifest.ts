import type { MetadataRoute } from 'next';
import { resolveTenantFromHost, brandingFor } from '@/lib/tenant';

// Next.js App Router special file — runs per-request (Node runtime),
// so resolveTenantFromHost() / headers() work correctly.
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  let name = 'HIR Restaurant';
  let themeColor = '#7c3aed';
  // TODO (ops): replace /icon-192.png and /icon-512.png in public/ with
  // actual PNG files (192×192 and 512×512, HIR purple on white).
  // The push service-worker already references /icon-192.png as notification
  // icon so both must be present before going live.
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
