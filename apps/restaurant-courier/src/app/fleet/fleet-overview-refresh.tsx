'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

const REFRESH_INTERVAL_MS = 60_000;

/**
 * Periodic router.refresh() on /fleet to keep KPIs and the live map
 * fresh when the manager leaves the tab open. Skips refresh while the
 * tab is hidden (saves a wasted RTT when the manager isn't looking)
 * and triggers an immediate refresh on visibilitychange so re-focusing
 * the tab gets fresh data without waiting for the next interval.
 *
 * 60s is intentionally a coarse cadence — fleet-orders-realtime already
 * pushes fine-grained updates on the dispatch board; this is a backstop
 * for KPIs that aren't covered by realtime subscriptions (today's
 * earnings sum, online courier count, etc.).
 */
export function FleetOverviewRefresh() {
  const router = useRouter();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    function start() {
      if (intervalRef.current) return;
      intervalRef.current = setInterval(() => {
        if (document.visibilityState === 'visible') {
          router.refresh();
        }
      }, REFRESH_INTERVAL_MS);
    }

    function stop() {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    function onVisibility() {
      if (document.visibilityState === 'visible') {
        // Tab just became visible → catch up immediately + restart interval.
        router.refresh();
        start();
      } else {
        stop();
      }
    }

    if (document.visibilityState === 'visible') start();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [router]);

  return null;
}
