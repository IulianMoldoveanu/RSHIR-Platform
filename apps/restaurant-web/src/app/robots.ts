import type { MetadataRoute } from 'next';
import { tenantBaseUrl } from '@/lib/tenant';

export const dynamic = 'force-dynamic';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = tenantBaseUrl();
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/m/', '/bio', '/privacy'],
        disallow: ['/api/', '/checkout', '/track', '/account'],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
