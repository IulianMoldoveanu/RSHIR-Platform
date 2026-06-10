'use client';

import { useEffect, useState } from 'react';
import { Banknote, Info, Loader2, MapPin } from 'lucide-react';
import { SwipeButton } from '@/components/swipe-button';
import { Button } from '@hir/ui';
import { PharmaChecks, type PharmaMetadata } from '@/components/pharma-checks';
import { PhotoProofUpload } from '@/components/photo-proof-upload';
import { CancelOrderModal } from '@/components/cancel-order-modal';
import { useRiderMode } from '@/components/rider-mode-provider';
import { runTransitionOrQueue } from '@/lib/transition-runner';
import { AppreciationToast } from '@/components/appreciation-toast';
import { incrementStreak, isMilestone } from '@/lib/delivery-streak';

/**
 * Client-side action panel for the order detail page. Renders the right
 * swipe-to-confirm based on the order's current status, and handles the
 * photo-proof capture flow before marking delivered.
 *
 * Server actions are passed in as props (already bound to the order id) so
 * this component stays thin and the parent keeps server-action ownership.
 */
type Props = {
  orderId: string;
  status: string;
  isMine: boolean;
  isAvailable: boolean;
  vertical: 'restaurant' | 'pharma';
  pharmaMetadata: PharmaMetadata | null;
  paymentMethod: 'CARD' | 'COD' | null;
  totalRon: number | null;
  // Return `boolean` (true = a row actually changed) so a silently-gated
  // no-op doesn't render a false success on the swipe button.
  acceptAction: () => Promise<void | boolean>;
  pickedUpAction: () => Promise<void | boolean>;
  /**
   * Server action that accepts an optional proof URL, an optional
   * cash_collected flag (only meaningful when payment_method=COD), and
   * optional pharma proofs (id + prescription) for pharma orders.
   */
  deliveredAction: (
    proofUrl?: string,
    cashCollected?: boolean,
    pharmaProofs?: { idUrl?: string; prescriptionUrl?: string },
  ) => Promise<void>;
  cancelAction: (
    reason: string,
    notes?: string,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
};

export function OrderActions({
  orderId,
  status,
  isMine,
  isAvailable,
  vertical,
  pharmaMetadata,
  paymentMethod,
  totalRon,
  acceptAction,
  pickedUpAction,
  deliveredAction,
  cancelAction,
}: Props) {
  const [pharmaOk, setPharmaOk] = useState(false);
  const [pharmaProofUrl, setPharmaProofUrl] = useState<string | undefined>(undefined);
  const [pharmaIdUrl, setPharmaIdUrl] = useState<string | undefined>(undefined);
  const [pharmaRxUrl, setPharmaRxUrl] = useState<string | undefined>(undefined);
  const [restaurantProofUrl, setRestaurantProofUrl] = useState<string | undefined>(undefined);
  const [showCashModal, setShowCashModal] = useState(false);
  const [milestoneCount, setMilestoneCount] = useState<number | null>(null);

  const { mode, fleetName } = useRiderMode();
  const acceptLabel = '→ Glisează pentru a accepta';

  // Listen for geofence-entered events fired by <GeofenceWatcher>. We don't
  // change behavior — the courier still glides the SwipeButton — but we
  // surface "tu ești aici, e momentul" by pulsing the relevant CTA. The
  // dedup logic upstream guarantees this fires at most once per state.
  const [geofenceState, setGeofenceState] = useState<
    'NEAR_PICKUP' | 'NEAR_DROPOFF' | null
  >(null);
  useEffect(() => {
    function onGeofence(e: Event) {
      const detail = (e as CustomEvent<{ orderId: string; alert: string }>).detail;
      if (!detail || detail.orderId !== orderId) return;
      if (detail.alert === 'NEAR_PICKUP' || detail.alert === 'NEAR_DROPOFF') {
        setGeofenceState(detail.alert);
      }
    }
    window.addEventListener('hir:geofence-entered', onGeofence);
    return () => window.removeEventListener('hir:geofence-entered', onGeofence);
  }, [orderId]);
  // Clear the hint as soon as the relevant status moves past it.
  useEffect(() => {
    if (geofenceState === 'NEAR_PICKUP' && status !== 'ACCEPTED') setGeofenceState(null);
    if (
      geofenceState === 'NEAR_DROPOFF' &&
      status !== 'PICKED_UP' &&
      status !== 'IN_TRANSIT'
    ) {
      setGeofenceState(null);
    }
  }, [status, geofenceState]);

  const isDeliveryPhase = isMine && (status === 'PICKED_UP' || status === 'IN_TRANSIT');
  const isCashOnDelivery = paymentMethod === 'COD';
  const cashAmountLabel = totalRon != null ? `${Number(totalRon).toFixed(2)} RON` : 'suma datorată';

  // Mode-C riders are dispatched by an external fleet manager (Bringo,
  // Bolt-Fleet, internal partner) and perform pickup/deliver actions in
  // *their* app — not here. Per decision_courier_three_modes.md, the
  // HIR Curier surface for Mode-C is read-only: status visibility only,
  // never a swipe-to-confirm, because firing one of these server actions
  // would split state between the two apps. Show a static info card so
  // the rider isn't left wondering why there's no button.
  if (mode === 'C') {
    return (
      <div className="flex items-start gap-3 rounded-2xl border border-hir-border bg-hir-surface p-4 text-sm ring-1 ring-inset ring-hir-border/40">
        <span
          aria-hidden
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-hir-border/40 ring-1 ring-hir-border/60"
        >
          <Info className="h-4 w-4 text-hir-muted-fg" strokeWidth={2.25} />
        </span>
        <div className="flex-1">
          <p className="font-semibold text-hir-fg">Vizualizare read-only</p>
          <p className="mt-0.5 text-xs leading-relaxed text-hir-muted-fg">
            {fleetName
              ? `Folosește aplicația flotei "${fleetName}" pentru a actualiza starea comenzii.`
              : 'Folosește aplicația flotei tale pentru a actualiza starea comenzii.'}
          </p>
        </div>
      </div>
    );
  }

  function handlePharmaComplete(urls: { delivery?: string; id?: string; prescription?: string }) {
    setPharmaOk(true);
    if (urls.delivery) setPharmaProofUrl(urls.delivery);
    // Capture id + prescription URLs so they reach the server action.
    // Migration 010 added the persisting columns; without these lines the
    // photos are uploaded but never linked to the order — confirmed bug.
    if (urls.id) setPharmaIdUrl(urls.id);
    if (urls.prescription) setPharmaRxUrl(urls.prescription);
  }

  function handleRestaurantPhotoComplete(urls: { delivery?: string }) {
    setRestaurantProofUrl(urls.delivery);
  }

  async function handleAcceptConfirm() {
    await runTransitionOrQueue('accept', orderId, {}, acceptAction);
  }

  async function handlePickedUpConfirm() {
    await runTransitionOrQueue('pickup', orderId, {}, pickedUpAction);
  }

  async function handleDeliverConfirm(cashCollected?: boolean) {
    const proofUrl = vertical === 'pharma' ? pharmaProofUrl : restaurantProofUrl;
    const pharmaProofs =
      vertical === 'pharma' && (pharmaIdUrl || pharmaRxUrl)
        ? { idUrl: pharmaIdUrl, prescriptionUrl: pharmaRxUrl }
        : undefined;
    const deliverResult = await runTransitionOrQueue(
      'deliver',
      orderId,
      { proofUrl, cashCollected, pharmaProofs },
      () => deliveredAction(proofUrl, cashCollected, pharmaProofs),
    );
    // If the device was offline the delivery was only ENQUEUED, not confirmed
    // on the server — don't fire the streak / first-delivered side-effects for
    // a delivery that hasn't actually landed (it would inflate the streak and
    // trigger the push re-ask for an unconfirmed delivery). The TransitionSync
    // chip shows the pending transition; side-effects run on the real drain.
    if (deliverResult.queued) return;
    // Signal that the courier has completed their first DELIVERED transition
    // this session. PushBootstrap watches for this flag to show the gentle
    // push re-ask banner (only once per session, only when permission is still
    // 'default'). Use try/catch — sessionStorage is blocked in some private
    // browsing contexts.
    try {
      sessionStorage.setItem('hir:first-delivered-this-session', '1');
    } catch {
      // Private mode or storage quota — ignore.
    }
    // Appreciation milestone: fires client-side after every 10 consecutive
    // successful deliveries. Counter lives in localStorage; wraps at 100.
    try {
      const streak = incrementStreak();
      if (isMilestone(streak)) {
        setMilestoneCount(streak);
      }
    } catch {
      // localStorage unavailable — ignore.
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {isAvailable ? (
        <SwipeButton label={acceptLabel} onConfirm={handleAcceptConfirm} />
      ) : null}

      {isMine && status === 'ACCEPTED' ? (
        <div className={geofenceState === 'NEAR_PICKUP' ? 'space-y-2' : ''}>
          {geofenceState === 'NEAR_PICKUP' && (
            <ArrivalHint label="Ești la restaurant — glisează pentru ridicare ↓" />
          )}
          <SwipeButton
            label="→ Glisează pentru a confirma ridicare"
            onConfirm={handlePickedUpConfirm}
          />
        </div>
      ) : null}

      {isDeliveryPhase ? (
        <>
          {/* Pharma: show verification section first; delivery swipe is gated. */}
          {vertical === 'pharma' && !pharmaOk ? (
            <PharmaChecks
              orderId={orderId}
              pharmaMetadata={pharmaMetadata ?? {}}
              onAllSatisfied={handlePharmaComplete}
            />
          ) : null}

          {/* Restaurant: photo proof (optional) shown above the swipe, does not block it. */}
          {vertical === 'restaurant' ? (
            <PhotoProofUpload
              orderId={orderId}
              vertical="restaurant"
              requiresId={false}
              requiresPrescription={false}
              onComplete={handleRestaurantPhotoComplete}
            />
          ) : null}

          {/* Final delivery action — shown after pharma checks pass (or for
              restaurant). COD opens the cash-collection pop-up; checking that
              box marks the order delivered (no extra "finalize" step). */}
          {vertical === 'restaurant' || pharmaOk ? (
            isCashOnDelivery ? (
              <div className={geofenceState === 'NEAR_DROPOFF' ? 'space-y-2' : ''}>
                {geofenceState === 'NEAR_DROPOFF' && (
                  <ArrivalHint label="Ești la adresa de livrare — confirmă livrarea ↓" />
                )}
                <Button
                  type="button"
                  onClick={() => setShowCashModal(true)}
                  className="w-full rounded-2xl bg-emerald-500 py-3.5 text-sm font-bold text-white shadow-lg shadow-emerald-500/30 transition-all hover:-translate-y-px hover:bg-emerald-400 hover:shadow-xl active:translate-y-0"
                >
                  Confirmă livrarea
                </Button>
              </div>
            ) : (
              <div className={geofenceState === 'NEAR_DROPOFF' ? 'space-y-2' : ''}>
                {geofenceState === 'NEAR_DROPOFF' && (
                  <ArrivalHint label="Ești la adresa de livrare — glisează pentru a confirma ↓" />
                )}
                <SwipeButton
                  label="→ Glisează pentru a confirma livrare"
                  onConfirm={() => handleDeliverConfirm()}
                  variant="success"
                />
              </div>
            )
          ) : null}
        </>
      ) : null}

      {/* Courier-initiated cancellation: only ACCEPTED or PICKED_UP.
          IN_TRANSIT is excluded — at that distance the courier should
          contact the dispatcher via QuickCallButtons instead. */}
      {isMine && (status === 'ACCEPTED' || status === 'PICKED_UP') ? (
        <CancelOrderModal cancelAction={cancelAction} />
      ) : null}

      {/* COD cash-collection pop-up: appears before finalizing. Checking the
          box IS the confirmation — it marks the order delivered, no extra step. */}
      {showCashModal ? (
        <CashCollectedModal
          amountLabel={cashAmountLabel}
          onConfirm={async () => {
            await handleDeliverConfirm(true);
            setShowCashModal(false);
          }}
          onDeliverWithoutCash={async () => {
            await handleDeliverConfirm(false);
            setShowCashModal(false);
          }}
          onClose={() => setShowCashModal(false)}
        />
      ) : null}

      {milestoneCount !== null ? (
        <AppreciationToast
          count={milestoneCount}
          onDismiss={() => setMilestoneCount(null)}
        />
      ) : null}
    </div>
  );
}

function ArrivalHint({ label }: { label: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center gap-2 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-100 ring-1 ring-inset ring-emerald-500/20 shadow-sm shadow-emerald-500/10 motion-safe:animate-pulse"
    >
      <MapPin className="h-3.5 w-3.5 flex-none" aria-hidden strokeWidth={2.25} />
      <span>{label}</span>
    </div>
  );
}

/**
 * COD cash-collection pop-up shown before finalizing the delivery. There is NO
 * separate "finalize" step: checking the box (tapping the row) IS the
 * confirmation and marks the order delivered (the server logs the COD audit
 * row when cashCollected=true). Stays open on error so the courier can retry.
 */
function CashCollectedModal({
  amountLabel,
  onConfirm,
  onDeliverWithoutCash,
  onClose,
}: {
  amountLabel: string;
  onConfirm: () => Promise<void>;
  /** Deliver but record cash as NOT collected (paid otherwise / problem at the
   *  door). Marks the order delivered with cashCollected=false so settlement
   *  sees the discrepancy instead of the courier having to lie or get stuck. */
  onDeliverWithoutCash: () => Promise<void>;
  onClose: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);

  async function confirm() {
    if (submitting) return;
    setSubmitting(true);
    try {
      await onConfirm();
    } catch {
      // Keep the modal open so the courier can retry the collection confirm.
      setSubmitting(false);
    }
  }

  async function confirmNoCash() {
    if (submitting) return;
    setSubmitting(true);
    try {
      await onDeliverWithoutCash();
    } catch {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[1300] flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Confirmare încasare cash"
    >
      <div className="w-full max-w-md rounded-2xl border border-hir-border bg-hir-bg p-5 shadow-2xl ring-1 ring-inset ring-emerald-500/15">
        <div className="mb-4 flex items-center gap-3">
          <span
            aria-hidden
            className="flex h-11 w-11 flex-none items-center justify-center rounded-2xl bg-emerald-500/15 ring-1 ring-emerald-500/30"
          >
            <Banknote className="h-5 w-5 text-emerald-300" strokeWidth={2.25} />
          </span>
          <div>
            <h2 className="text-base font-semibold text-hir-fg">Încasare cash</h2>
            <p className="text-xs text-hir-muted-fg">
              Bifează ca să finalizezi livrarea.
            </p>
          </div>
        </div>

        {/* Tapping this row = checking the box = order delivered. No extra step. */}
        <button
          type="button"
          onClick={confirm}
          disabled={submitting}
          aria-busy={submitting}
          className="flex w-full items-center gap-3 rounded-2xl border-2 border-emerald-500/50 bg-emerald-500/10 px-4 py-4 text-left transition-all hover:bg-emerald-500/15 active:scale-[0.99] disabled:opacity-70 focus-visible:outline-2 focus-visible:outline-emerald-400 focus-visible:outline-offset-2"
        >
          <span className="flex h-7 w-7 flex-none items-center justify-center rounded-md border-2 border-emerald-400 bg-emerald-500/20 text-emerald-200">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          </span>
          <span className="text-sm font-semibold text-emerald-100">
            Am încasat suma de{' '}
            <span className="tabular-nums">{amountLabel}</span> de la client
          </span>
        </button>

        {/* Secondary, low-emphasis path: delivered but cash not collected
            (paid by other means / problem). Records cashCollected=false so the
            courier is never forced to falsely attest collection. */}
        <button
          type="button"
          onClick={confirmNoCash}
          disabled={submitting}
          className="mt-2 w-full rounded-xl border border-amber-500/40 bg-amber-500/5 px-4 py-2.5 text-xs font-medium text-amber-200 transition-colors hover:bg-amber-500/10 disabled:opacity-70 focus-visible:outline-2 focus-visible:outline-amber-400 focus-visible:outline-offset-2"
        >
          Am livrat, dar fără încasare
        </button>

        <Button
          type="button"
          variant="ghost"
          onClick={onClose}
          disabled={submitting}
          className="mt-2 w-full rounded-xl py-2.5 text-sm font-medium text-hir-muted-fg transition-colors hover:bg-hir-surface hover:text-hir-fg"
        >
          Anulează
        </Button>
      </div>
    </div>
  );
}
