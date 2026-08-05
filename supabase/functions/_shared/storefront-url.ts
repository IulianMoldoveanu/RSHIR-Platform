// Where a customer's order lives, from the tenant that owns it.
//
// The notification functions used to build this from a single global env var
// (RESTAURANT_WEB_URL, and in review-reminder a differently-named
// NEXT_PUBLIC_RESTAURANT_WEB_URL). Neither is set in production, so every
// branch guarded by it collapsed to null and the emails went out with no
// tracking link at all — the map, the courier's position and the chat all
// worked, and nothing told the customer how to reach them.
//
// A global base URL would also be the wrong shape even when set: it would land
// every customer on the marketing host, which is branded HIR rather than the
// restaurant, and where the support panel is deliberately not rendered
// (`!marketingSurface` in the web layout). So the link is built from the
// tenant's own storefront host instead, which is where the customer ordered
// and where help is available if something went wrong.

export type StorefrontTenant = {
  slug?: string | null;
  custom_domain?: string | null;
  domain_status?: string | null;
};

const DEFAULT_ROOT_DOMAIN = 'hirforyou.ro';

/**
 * Base URL of the tenant's storefront, without a trailing slash.
 *
 * Order of preference:
 *   1. a verified custom domain — what the restaurant put on its own flyers
 *   2. `<slug>.<root>` — always exists for an active tenant
 *   3. the env fallback, for a tenant we somehow could not identify
 *
 * Returns null only when none of those can be formed, so callers keep their
 * existing "no link" branch rather than emitting a broken href.
 */
export function storefrontBaseUrl(
  tenant: StorefrontTenant | null | undefined,
  envFallback?: string | null,
): string | null {
  const strip = (u: string) => u.replace(/\/+$/, '');

  const custom = tenant?.custom_domain?.trim();
  if (custom && tenant?.domain_status === 'ACTIVE') {
    return strip(custom.startsWith('http') ? custom : `https://${custom}`);
  }

  const slug = tenant?.slug?.trim();
  if (slug) {
    const root = (Deno.env.get('HIR_ROOT_DOMAIN') ?? DEFAULT_ROOT_DOMAIN).replace(/^https?:\/\//, '');
    return `https://${slug}.${strip(root)}`;
  }

  const fallback = envFallback?.trim();
  return fallback ? strip(fallback) : null;
}

/** Public tracking URL for one order, or null when no base can be formed. */
export function trackUrl(
  tenant: StorefrontTenant | null | undefined,
  publicTrackToken: string | null | undefined,
  envFallback?: string | null,
): string | null {
  if (!publicTrackToken) return null;
  const base = storefrontBaseUrl(tenant, envFallback);
  return base ? `${base}/track/${publicTrackToken}` : null;
}
