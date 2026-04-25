import type { TenantSettings } from './tenant';

/**
 * Returns the tenant-configured `meta_description` override (RSHIR-36 SEO
 * settings) when it's a non-empty string ≤ 200 chars, else `fallback`.
 */
export function metaDescriptionFor(
  settings: TenantSettings & { meta_description?: unknown },
  fallback: string,
): string {
  const raw = settings.meta_description;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (trimmed.length > 0) return trimmed.slice(0, 200);
  }
  return fallback;
}
