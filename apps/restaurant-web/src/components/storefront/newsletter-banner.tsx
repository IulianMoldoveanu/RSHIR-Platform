'use client';

import { useEffect, useState } from 'react';

// Track A #11: emerald success banner shown when the storefront URL has
// `?subscribed=1` (post-confirmation redirect from /api/newsletter/confirm).
// Auto-dismisses after 6s. Reads URL on mount to keep the home page server-
// rendered.

export function NewsletterBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('subscribed') !== '1') return;
    setVisible(true);
    const t = window.setTimeout(() => setVisible(false), 6000);
    // Strip the param so a refresh doesn't show the banner again.
    params.delete('subscribed');
    const qs = params.toString();
    const url = window.location.pathname + (qs ? `?${qs}` : '') + window.location.hash;
    window.history.replaceState(null, '', url);
    return () => window.clearTimeout(t);
  }, []);

  if (!visible) return null;
  return (
    <div className="mx-auto mt-3 max-w-2xl px-4">
      <div
        role="status"
        className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
      >
        <span aria-hidden>✅</span>
        <span>Te-ai abonat cu succes! Verifică emailul pentru confirmare.</span>
      </div>
    </div>
  );
}
