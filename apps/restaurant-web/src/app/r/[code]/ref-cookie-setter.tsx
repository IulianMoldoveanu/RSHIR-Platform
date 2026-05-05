'use client';

// Sets the `hir_ref` cookie when a visitor lands on /r/<code>. Used for
// indirect attribution (user comes back later through a different entry
// point — direct URL, search, etc.). Primary attribution is via the `?ref=`
// query param threaded through the CTA on the landing.
//
// 90-day TTL matches the affiliate cookie window declared in the program
// terms. Domain is intentionally NOT pinned: when the storefront and admin
// share a parent domain in production (e.g. *.hirforyou.ro), we'll set the
// `Domain` attribute via a follow-up. On preview/dev hostnames cookies are
// host-only — that's fine; the URL `?ref=` path is the primary mechanism.

import { useEffect } from 'react';

const COOKIE_NAME = 'hir_ref';
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 90; // 90 days

export function RefCookieSetter({ code }: { code: string }) {
  useEffect(() => {
    if (!code) return;
    if (!/^[A-Z0-9]{4,32}$/.test(code)) return;
    try {
      const isHttps =
        typeof window !== 'undefined' && window.location.protocol === 'https:';
      const parts = [
        `${COOKIE_NAME}=${encodeURIComponent(code)}`,
        `Max-Age=${COOKIE_MAX_AGE_SECONDS}`,
        'Path=/',
        'SameSite=Lax',
      ];
      if (isHttps) parts.push('Secure');
      document.cookie = parts.join('; ');
    } catch {
      // Best-effort; never block render on cookie write.
    }
  }, [code]);
  return null;
}
