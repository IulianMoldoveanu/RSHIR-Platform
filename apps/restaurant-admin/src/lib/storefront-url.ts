/**
 * Build a clickable storefront URL for a tenant.
 *
 * Two modes:
 *
 * 1. **Wildcard subdomain mode** — set `NEXT_PUBLIC_TENANT_SUBDOMAIN_BASE`
 *    (e.g. `hiraisolutions.ro`) ONLY when wildcard DNS (`*.<base>`) is
 *    actually wired and the certificate covers it. The link becomes
 *    `https://<slug>.<base>`.
 *
 * 2. **Query-string fallback** (default while wildcard DNS is not wired) —
 *    we link to the canonical web app with `?tenant=<slug>`. The web
 *    middleware reads `?tenant=` and resolves the tenant by slug, so the
 *    storefront renders correctly even on the bare Vercel host. Base URL
 *    is `NEXT_PUBLIC_RESTAURANT_WEB_URL` (the convention already used by
 *    review-reminder, reservations, affiliates) and falls back to the
 *    public Vercel URL.
 *
 * Note: `NEXT_PUBLIC_PRIMARY_DOMAIN` is intentionally NOT consulted here.
 * That variable describes the domain validation policy for custom-domain
 * input; it does not imply wildcard DNS is wired. Conflating the two was
 * the cause of the broken `Vezi storefront` button (subdomain link 404).
 */
export function tenantStorefrontUrl(slug: string): string {
  const subdomainBase = process.env.NEXT_PUBLIC_TENANT_SUBDOMAIN_BASE?.trim();
  if (subdomainBase) {
    return `https://${slug}.${subdomainBase}`;
  }
  const webBase = (
    process.env.NEXT_PUBLIC_RESTAURANT_WEB_URL ?? 'https://hir-restaurant-web.vercel.app'
  ).replace(/\/+$/, '');
  return `${webBase}/?tenant=${encodeURIComponent(slug)}`;
}
