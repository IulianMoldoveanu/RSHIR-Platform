'use client';

import {
  enqueueTransition,
  type TransitionKind,
  type TransitionPayload,
} from './transition-queue';

const ENQUEUED_EVENT = 'hir:transition-enqueued';

// A network-flavoured failure: the server action couldn't reach the server
// (offline, DNS failure, fetch aborted). TypeError is what fetch throws in
// Chromium / Firefox / Safari when the network leg fails before a response
// arrives. We use `'TypeError'` rather than `instanceof TypeError` because
// Next's server-action runtime wraps errors and the prototype chain may not
// survive the wrap — checking `.name` works regardless.
//
// HTTP errors (4xx/5xx) reach this code as a *resolved* promise with the
// server-action error shape, not a thrown TypeError, so they fall through
// to `throw err` and surface normally to the user.
function isNetworkFailure(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const name = (err as { name?: string }).name;
  return name === 'TypeError' || name === 'AbortError';
}

type RunResult = { queued: boolean };

// Wraps a bound server action with offline-queue fallback. If the device is
// currently offline (per `navigator.onLine`), the transition is enqueued
// immediately without dispatching the network call. If the call is attempted
// and fails with a network-flavoured error, we enqueue and resolve.
//
// The server actions are structurally idempotent — every UPDATE filters on
// `.in('status', [from])` plus `.eq('assigned_courier_user_id', userId)`,
// so a replay after the transition has already succeeded (or after another
// courier claimed the order) silently no-ops on the server. This makes it
// safe to retry without per-item dedupe tokens.
export async function runTransitionOrQueue(
  kind: TransitionKind,
  orderId: string,
  payload: TransitionPayload,
  action: () => Promise<void>,
): Promise<RunResult> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    await enqueueTransition({ kind, orderId, payload });
    notifyEnqueued();
    registerBgSync();
    return { queued: true };
  }
  try {
    await action();
    return { queued: false };
  } catch (err) {
    if (isNetworkFailure(err)) {
      await enqueueTransition({ kind, orderId, payload });
      notifyEnqueued();
      registerBgSync();
      return { queued: true };
    }
    throw err;
  }
}

function notifyEnqueued(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(ENQUEUED_EVENT));
}

// Best-effort Background Sync registration. Chrome fires a 'sync' event on
// the service worker when the network returns, even with the tab closed.
// iOS Safari does not support Background Sync — the page-context drainer in
// <TransitionSync> is the fallback for those clients. Errors are swallowed
// so a missing SW or unsupported browser never breaks normal enqueue flow.
function registerBgSync(): void {
  if (typeof navigator === 'undefined') return;
  navigator.serviceWorker?.ready
    .then((reg) => {
      // SyncManager is not defined on iOS Safari — guard before calling.
      if (!('sync' in reg)) return;
      return (reg.sync as { register(tag: string): Promise<void> }).register(
        'transition-queue-drain',
      );
    })
    .catch(() => {});
}
