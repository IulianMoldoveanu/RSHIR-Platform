/**
 * Lane I (2026-05-04) — UTM helper for social-share buttons.
 *
 * Every share link gets `utm_source=<channel>&utm_medium=share&utm_campaign=
 * <tenantSlug>` so storefront analytics can attribute traffic back to the
 * channel where the share originated. We never overwrite an existing
 * `utm_*` query string — affiliates may craft their own.
 */
export type ShareChannel =
  | 'whatsapp'
  | 'facebook'
  | 'twitter'
  | 'telegram'
  | 'copy'
  | 'native';

export function appendUtm(rawUrl: string, channel: ShareChannel, tenantSlug: string): string {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return rawUrl;
  }
  if (!url.searchParams.has('utm_source')) url.searchParams.set('utm_source', channel);
  if (!url.searchParams.has('utm_medium')) url.searchParams.set('utm_medium', 'share');
  if (!url.searchParams.has('utm_campaign')) url.searchParams.set('utm_campaign', tenantSlug);
  return url.toString();
}
