// Which third-party sites may frame a tenant's storefront widget.
//
// Replaces the `frame-ancestors *` stopgap from 2026-08-02 (see middleware.ts
// and PR #1037): that restored the embed product, which our own
// X-Frame-Options had been silently killing, but let *any* site frame a
// checkout surface. This resolves the real allow-list instead.
//
// Sources, in order:
//   1. the tenant's own verified `custom_domain` (+ its `www.` sibling) —
//      a merchant embedding the widget on the domain they already proved they
//      own is the overwhelmingly common case, and needs zero configuration
//   2. `settings.embed.allowed_origins` — for the case where the storefront
//      lives on `<slug>.hirforyou.ro` but the marketing site is elsewhere
//
// If neither yields anything, no third party may frame: `frame-ancestors`
// falls back to `'self'` in the caller. Secure by default is affordable here
// precisely because the widget has never actually worked in production, so
// there is no install base to regress.
//
// Runs on the Edge runtime (middleware), so: fetch only, no Supabase client,
// no Node built-ins. Reads through the anon-safe `v_tenants_storefront` view.

const CACHE_TTL_MS = 5 * 60 * 1000;
const FETCH_TIMEOUT_MS = 1500;

type CacheEntry = { origins: string[]; expiresAt: number };
const cache = new Map<string, CacheEntry>();

/**
 * Drop the memoised lookups. Only for tests — each case sets up a different
 * tenant row for the same host, and a 5-minute TTL would leak the first
 * case's answer into all the others.
 */
export function resetEmbedOriginCache(): void {
  cache.clear();
}

// A CSP source expression we're willing to emit: https, a hostname, an
// optional port, and at most a single leading `*.` label. Deliberately strict
// — this string goes into a response header, so anything carrying whitespace,
// `;`, `'` or a path must never make it through, or a tenant with write
// access to its own settings could rewrite the whole policy.
const ORIGIN_RE = /^https:\/\/(\*\.)?[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+(:\d{2,5})?$/;

export function sanitizeEmbedOrigins(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const out: string[] = [];
  for (const raw of input) {
    if (typeof raw !== 'string') continue;
    const value = raw.trim().toLowerCase().replace(/\/+$/, '');
    if (!ORIGIN_RE.test(value)) continue;
    if (!out.includes(value)) out.push(value);
    // A tenant misconfiguring 200 origins shouldn't produce a header a proxy
    // will truncate.
    if (out.length >= 10) break;
  }
  return out;
}

function domainOrigins(customDomain: unknown, domainStatus: unknown): string[] {
  if (typeof customDomain !== 'string' || !customDomain) return [];
  // Only a domain we've actually verified. An unverified one is a claim, not
  // a fact, and this grants framing rights.
  if (typeof domainStatus === 'string' && domainStatus.toUpperCase() !== 'VERIFIED') return [];
  const host = customDomain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  const bare = host.replace(/^www\./, '');
  return sanitizeEmbedOrigins([`https://${bare}`, `https://www.${bare}`]);
}

/**
 * Origins allowed to frame the storefront served on `host`.
 * Never throws and never blocks the request for long: on any error, or if the
 * lookup is slow, it returns `[]` and the caller falls back to `'self'`.
 */
export async function allowedEmbedOrigins(host: string, tenantOverride?: string | null): Promise<string[]> {
  const key = `${host}::${tenantOverride ?? ''}`;
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.origins;

  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!base || !anonKey) return [];

  // The canonical marketing host has no tenant, so there is nothing to look
  // up — and without this guard the slug falls out as the apex label
  // ("hirforyou"), which is a meaningless query at best and, if a tenant ever
  // took that slug, would hand it framing rights over the apex.
  const primaryDomain = process.env.NEXT_PUBLIC_PRIMARY_DOMAIN || 'hirforyou.ro';
  const isCanonical =
    host === primaryDomain || host === 'hir-restaurant-web.vercel.app' || host === 'localhost';
  if (!tenantOverride && isCanonical) return [];

  const slug = tenantOverride || host.split('.')[0];
  const params = new URLSearchParams({
    select: 'custom_domain,domain_status,settings',
    or: `(custom_domain.eq.${host},slug.eq.${slug})`,
    limit: '1',
  });

  let origins: string[] = [];
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(`${base}/rest/v1/v_tenants_storefront?${params}`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));

    if (res.ok) {
      const rows = (await res.json()) as Array<Record<string, unknown>>;
      const row = rows?.[0];
      if (row) {
        const settings = (row.settings ?? {}) as Record<string, unknown>;
        const embed = (settings.embed ?? {}) as Record<string, unknown>;
        origins = [
          ...domainOrigins(row.custom_domain, row.domain_status),
          ...sanitizeEmbedOrigins(embed.allowed_origins),
        ];
        origins = [...new Set(origins)];
      }
    }
  } catch {
    // Timeout, network blip, view renamed — deny third-party framing rather
    // than fail open. The storefront itself still renders.
  }

  cache.set(key, { origins, expiresAt: Date.now() + CACHE_TTL_MS });
  return origins;
}
