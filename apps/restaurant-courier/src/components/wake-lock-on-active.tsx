'use client';

import { useEffect, useRef } from 'react';

const ACTIVE_STATUSES = new Set(['ACCEPTED', 'PICKED_UP', 'IN_TRANSIT']);

/**
 * Mounts invisibly on the order detail page. Acquires a screen wake lock
 * whenever the order is in an active delivery status so the courier's screen
 * stays on while they're navigating to the pickup or dropoff location.
 *
 * Lifecycle:
 *  - Acquires lock when `status` enters ACTIVE_STATUSES.
 *  - Releases lock when `status` leaves ACTIVE_STATUSES.
 *  - Releases lock when the document becomes hidden (tab switch / app backgrounded).
 *  - Reacquires lock when the document becomes visible again AND status is still active.
 *  - Degrades silently on browsers without the Wake Lock API (Firefox, iOS Safari <16).
 *
 * Renders nothing — pure side-effect component.
 */
export function WakeLockOnActive({ status }: { status: string }) {
  const lockRef = useRef<WakeLockSentinel | null>(null);

  async function acquire() {
    if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;
    if (lockRef.current && !lockRef.current.released) return;
    try {
      lockRef.current = await navigator.wakeLock.request('screen');
    } catch {
      // Permission denied or API unavailable — degrade silently.
    }
  }

  function release() {
    if (lockRef.current && !lockRef.current.released) {
      lockRef.current.release().catch(() => {
        // Already released or browser cleaned up — ignore.
      });
    }
    lockRef.current = null;
  }

  useEffect(() => {
    const isActive = ACTIVE_STATUSES.has(status);

    if (!isActive) {
      release();
      return;
    }

    // Acquire immediately if the document is visible.
    if (document.visibilityState === 'visible') {
      void acquire();
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'hidden') {
        release();
      } else {
        // Reacquire on return — the OS releases wake locks automatically
        // when the page is backgrounded, so we must request again.
        void acquire();
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      release();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  return null;
}
