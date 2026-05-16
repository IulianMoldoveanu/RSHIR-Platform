'use client';

import { useEffect, useRef } from 'react';
import { toast } from '@hir/ui';

const IDLE_THRESHOLD_MS = 30 * 60 * 1000; // 30 min
const REFIRE_KEY = 'hir-courier-idle-nudge-fired-at';
// Suppress more than one nudge per hour even if the user dismisses fast.
const REFIRE_WINDOW_MS = 60 * 60 * 1000;
const CHECK_INTERVAL_MS = 5 * 60 * 1000; // poll every 5 min

type Props = {
  /** Server-rendered count of active orders for THIS courier. */
  activeOrders: number;
  /** Whether the courier is currently on an ONLINE shift. */
  isOnline: boolean;
  /**
   * ISO timestamp of when the current shift went online. Used as the
   * reference point for the "no orders yet" elapsed clock.
   */
  shiftStartedAt: string | null;
};

/**
 * Friendly nudge when a courier has been online for 30+ minutes with
 * zero active orders. Suggests reposition to a busier zone (links to
 * /dashboard/busy-hours) so they don't sit on a quiet corner all evening.
 *
 * Skipped entirely when:
 *   - the courier is offline (no shift)
 *   - they already have an active order
 *   - shift just started (< 30 min)
 *   - we fired a nudge in the last hour (sessionStorage de-dupe)
 *
 * Pure client. Sub-1ms cost; renders null.
 */
export function IdleShiftNudge({ activeOrders, isOnline, shiftStartedAt }: Props) {
  const firedRef = useRef(false);

  useEffect(() => {
    if (!isOnline) return;
    if (activeOrders > 0) return;
    if (!shiftStartedAt) return;
    if (firedRef.current) return;

    const start = new Date(shiftStartedAt).getTime();
    if (!Number.isFinite(start)) return;

    function check() {
      if (firedRef.current) return;
      const elapsed = Date.now() - start;
      if (elapsed < IDLE_THRESHOLD_MS) return;

      // Session-level de-dupe: at most once per hour.
      let lastFired = 0;
      try {
        const raw = sessionStorage.getItem(REFIRE_KEY);
        if (raw) lastFired = Number(raw) || 0;
      } catch {
        // sessionStorage unavailable — proceed and skip the persist.
      }
      if (Date.now() - lastFired < REFIRE_WINDOW_MS) {
        firedRef.current = true;
        return;
      }

      try {
        sessionStorage.setItem(REFIRE_KEY, String(Date.now()));
      } catch {
        // ignore
      }
      firedRef.current = true;

      const mins = Math.floor(elapsed / 60_000);
      toast(
        `${mins} minute online, nicio comandă. Verifică „Ore cu volum mare" pentru zona ta.`,
        { duration: 8_000 },
      );
    }

    check();
    const id = window.setInterval(check, CHECK_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [activeOrders, isOnline, shiftStartedAt]);

  return null;
}
