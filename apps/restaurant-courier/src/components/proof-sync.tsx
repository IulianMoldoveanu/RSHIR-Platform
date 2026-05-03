'use client';

import { useEffect, useRef, useState } from 'react';
import { CloudOff, CloudUpload } from 'lucide-react';
import {
  bumpAttempts,
  countPendingProofs,
  deleteProof,
  listPendingProofs,
} from '@/lib/proof-queue';
import { uploadQueuedProof } from '@/lib/proof-uploader';

const RETRY_INTERVAL_MS = 60_000;
const MAX_ATTEMPTS = 8;

// Mounted in the dashboard layout. Pulls queued proof uploads out of
// IndexedDB and retries them whenever the device is online — on first
// mount, on `online` event, and on a 60s interval as a backstop.
//
// Renders a small floating chip with the pending count so the rider sees
// "3 fotografii în așteptare" instead of silently losing them.
export function ProofSync() {
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const runningRef = useRef(false);

  async function refreshCount() {
    try {
      const n = await countPendingProofs();
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
      const items = await listPendingProofs();
      for (const item of items) {
        if (item.id == null) continue;
        if (item.attempts >= MAX_ATTEMPTS) continue;
        try {
          await uploadQueuedProof(item);
          await deleteProof(item.id);
        } catch {
          await bumpAttempts(item.id);
        }
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
    const onProofEnqueued = () => refreshCount();

    window.addEventListener('online', onOnline);
    window.addEventListener('hir:proof-enqueued', onProofEnqueued);
    const interval = window.setInterval(runSync, RETRY_INTERVAL_MS);

    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('hir:proof-enqueued', onProofEnqueued);
      window.clearInterval(interval);
    };
  }, []);

  if (pending === 0) return null;

  return (
    <div
      role="status"
      className="pointer-events-none fixed bottom-20 left-1/2 z-40 -translate-x-1/2 rounded-full border border-amber-700/40 bg-amber-950/90 px-3 py-1.5 text-[11px] font-medium text-amber-200 shadow-lg backdrop-blur"
    >
      <span className="flex items-center gap-1.5">
        {syncing ? (
          <CloudUpload className="h-3.5 w-3.5 animate-pulse" aria-hidden />
        ) : (
          <CloudOff className="h-3.5 w-3.5" aria-hidden />
        )}
        {pending} {pending === 1 ? 'fotografie' : 'fotografii'} în așteptare
      </span>
    </div>
  );
}
