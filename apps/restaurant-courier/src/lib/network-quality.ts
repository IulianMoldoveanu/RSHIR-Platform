'use client';

/**
 * React hook and helpers for reading the device's perceived network quality.
 *
 * BROWSER SUPPORT MATRIX
 * ----------------------
 * Chrome / Android WebView / Samsung Internet — full Network Information API
 *   (`navigator.connection.effectiveType`): '2g' | '3g' | '4g' | 'slow-2g'.
 * Safari iOS / Firefox — Network Information API is NOT available.
 *   On these browsers `useNetworkQuality` returns 'offline' (no signal)
 *   or '4g' (connected) — a binary signal good enough for the UI badge.
 *
 * USAGE
 * -----
 * ```tsx
 * const quality = useNetworkQuality(); // 'offline' | '2g' | '3g' | '4g'
 * ```
 * The hook subscribes to `window` online/offline events and, on Chrome,
 * the Network Information API 'change' event. State updates are reactive;
 * no polling.
 *
 * WHY THIS EXISTS
 * ---------------
 * Couriers operate on 3G/4G in the field. The offline banner and the
 * proof-queue sync sentinel both gate behaviour on network quality so
 * the app degrades gracefully rather than silently hanging.
 */

import { useEffect, useState } from 'react';

// Non-standard Network Information API. Available in Chrome/Android WebViews
// and Chromium-based mobile browsers. Safari iOS does NOT expose it; those
// devices fall back to navigator.onLine only (online/offline distinction).
type NetworkInformation = {
  effectiveType: '2g' | '3g' | '4g' | 'slow-2g';
  addEventListener(event: string, handler: () => void): void;
  removeEventListener(event: string, handler: () => void): void;
};

type NavigatorWithConnection = Navigator & {
  connection?: NetworkInformation;
};

export type NetworkQuality = 'offline' | '2g' | '3g' | '4g';

function readQuality(): NetworkQuality {
  if (typeof navigator === 'undefined') return '4g';
  if (!navigator.onLine) return 'offline';
  const conn = (navigator as NavigatorWithConnection).connection;
  if (!conn) return '4g'; // Unknown — optimistic default
  return conn.effectiveType === 'slow-2g' ? '2g' : conn.effectiveType;
}

// Returns the current perceived connection quality, updated reactively when
// the browser fires online/offline events or the Network Information API
// fires a 'change' event. On Safari iOS (no Network Information API) the
// returned value is 'offline' or '4g' only — good enough for the badge.
export function useNetworkQuality(): NetworkQuality {
  const [quality, setQuality] = useState<NetworkQuality>(readQuality);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const update = () => setQuality(readQuality());

    window.addEventListener('online', update);
    window.addEventListener('offline', update);

    const conn = (navigator as NavigatorWithConnection).connection;
    conn?.addEventListener('change', update);

    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
      conn?.removeEventListener('change', update);
    };
  }, []);

  return quality;
}
