import { cookies, headers } from 'next/headers';

/**
 * Lane Y5 (2026-05-05) — embed-mode detector for server components.
 *
 * The middleware sets `x-hir-embed: 1` on the request when either
 * `?embed=1` is in the query OR the `hir_embed` cookie is set (so the
 * flag survives in-app navigation that drops the query string, e.g.
 * /checkout → /checkout/success → /track/<token>).
 *
 * Server components can call `isEmbedMode()` to:
 *   - hide global chrome (header / footer / cookie banner / install prompt)
 *   - inject a small `parent.postMessage` script on checkout success
 */
export function isEmbedMode(): boolean {
  const headerFlag = headers().get('x-hir-embed') === '1';
  if (headerFlag) return true;
  // Fallback for routes/edge cases where middleware might not have run
  // (e.g. static assets); cookie is the source of truth either way.
  return cookies().get('hir_embed')?.value === '1';
}
