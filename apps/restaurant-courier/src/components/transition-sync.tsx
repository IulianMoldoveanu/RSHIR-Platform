'use client';

import { useEffect, useRef, useState } from 'react';
import { CloudOff, CloudUpload } from 'lucide-react';
import { toast } from '@hir/ui';
import {
  acceptOrderAction,
  markPickedUpAction,
  markDeliveredAction,
} from '@/app/dashboard/actions';
import {
  bumpTransitionAttempts,
  countPendingTransitions,
  deleteTransition,
  listPendingTransitions,
  type QueuedTransition,
} from '@/lib/transition-queue';

const RETRY_INTERVAL_MS = 60_000;
const MAX_ATTEMPTS = 8;

// Mounted in the dashboard layout next to <ProofSync />. Drains queued
// state-machine transitions (accept / pickup / deliver) out of IndexedDB
// and re-invokes the server actions whenever the device is online.
//
// Renders a small chip with the pending count so the rider sees
// "2 tranziții în așteptare" instead of having a swipe silently disappear.
// Position is offset 6px above the ProofSync chip so the two stack rather
// than overlap when both are pending.
export function TransitionSync() {
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const runningRef = useRef(false);

  async function refreshCount() {
    try {
      const n = await countPendingTransitions();
      setPending(n);
    } catch {
      // IDB unavailable (private mode / blocked) — nothing to surface.
    }
  }

  async function runSync() {
    if (runningRef.current) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    runningRef.current = true;
    setSyncing(true);
    try {
      const items = await listPendingTransitions();
      const dropped: QueuedTransition[] = [];
      for (const item of items) {
        if (item.id == null) continue;
        if (item.attempts >= MAX_ATTEMPTS) {
          // Stop retrying after MAX_ATTEMPTS so we don't loop forever on a
          // permanently-failing item (e.g. order no longer in the courier's
          // fleet). Drop it. The structural status filters on the server
          // would silently no-op these anyway, so dropping doesn't lose data.
          // Collect for user notification below — silent drop is confusing.
          await deleteTransition(item.id);
          dropped.push(item);
          continue;
        }
        try {
          await dispatchTransition(item);
          await deleteTransition(item.id);
        } catch {
          await bumpTransitionAttempts(item.id);
        }
      }
      // Notify the courier about any transitions that exhausted all retries.
      // The server-side state filter means the order status was already
      // advanced (or the order is no longer theirs), so no data is lost —
      // but the rider needs to know to check the order manually.
      for (const item of dropped) {
        const label =
          item.kind === 'accept'
            ? 'acceptare'
            : item.kind === 'pickup'
              ? 'ridicare'
              : 'livrare';
        toast.error(
          `Tranziția de ${label} nu a putut fi sincronizată. Verifică starea comenzii manual.`,
          { duration: 8000 },
        );
      }
    } catch {
      // List failed; will retry on next tick.
    } finally {
      runningRef.current = false;
      setSyncing(false);
      refreshCount();
    }
  }

  useEffect(() => {
    refreshCount();
    runSync();

    const onOnline = () => runSync();
    const onEnqueued = () => {
      refreshCount();
      runSync();
    };

    window.addEventListener('online', onOnline);
    window.addEventListener('hir:transition-enqueued', onEnqueued);
    const interval = window.setInterval(runSync, RETRY_INTERVAL_MS);

    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('hir:transition-enqueued', onEnqueued);
      window.clearInterval(interval);
    };
    // runSync is intentionally a stable closure for mount-once setup. It
    // guards against concurrent calls via runningRef and reads its inputs
    // from IDB on each tick, so adding it to deps would re-bind listeners
    // and intervals on every render without changing behaviour.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (pending === 0) return null;

  return (
    <div
      role="status"
      className="pointer-events-none fixed bottom-32 left-1/2 z-40 -translate-x-1/2 rounded-full border border-violet-700/40 bg-violet-950/90 px-3 py-1.5 text-[11px] font-medium text-violet-200 shadow-lg backdrop-blur"
    >
      <span className="flex items-center gap-1.5">
        {syncing ? (
          <CloudUpload className="h-3.5 w-3.5 animate-pulse" aria-hidden />
        ) : (
          <CloudOff className="h-3.5 w-3.5" aria-hidden />
        )}
        {pending} {pending === 1 ? 'tranziție' : 'tranziții'} în așteptare
      </span>
    </div>
  );
}

async function dispatchTransition(item: QueuedTransition): Promise<void> {
  switch (item.kind) {
    case 'accept':
      await acceptOrderAction(item.orderId);
      return;
    case 'pickup':
      await markPickedUpAction(item.orderId);
      return;
    case 'deliver':
      await markDeliveredAction(
        item.orderId,
        item.payload.proofUrl,
        item.payload.cashCollected,
        item.payload.pharmaProofs,
      );
      return;
  }
}
