'use client';

import { useEffect, useState } from 'react';
import { Banknote, Info, MapPin } from 'lucide-react';
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
  acceptAction: () => Promise<void>;
  pickedUpAction: () => Promise<void>;
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
  // Three-state cash gate:
  //   null  = not yet interacted (gate shown, swipe hidden)
  //   true  = courier confirmed cash collected → cashCollected=true to server
  //   false = courier explicitly declined → cashCollected=false to server (admin review)
  const [cashDecision, setCashDecision] = useState<boolean | null>(null);
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

  async function handleDeliverConfirm() {
    const proofUrl = vertical === 'pharma' ? pharmaProofUrl : restaurantProofUrl;
    const pharmaProofs =
      vertical === 'pharma' && (pharmaIdUrl || pharmaRxUrl)
        ? { idUrl: pharmaIdUrl, prescriptionUrl: pharmaRxUrl }
        : undefined;
    // Pass the explicit cash decision. undefined for non-COD orders.
    const cashCollected = isCashOnDelivery ? (cashDecision ?? false) : undefined;
    await runTransitionOrQueue(
      'deliver',
      orderId,
      { proofUrl, cashCollected, pharmaProofs },
      () => deliveredAction(proofUrl, cashCollected, pharmaProofs),
    );
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

          {/*
            Cash-on-delivery confirm: gate the delivery swipe behind an
            explicit "Da, am încasat XX RON" tap. FOISORUL A pilot is
            cash-only; without this gate, settlement would have no signal
            that cash actually changed hands.
          */}
          {isCashOnDelivery && (vertical === 'restaurant' || pharmaOk) ? (
            <CashCollectedGate
              amountLabel={cashAmountLabel}
              decision={cashDecision}
              onConfirm={() => setCashDecision(true)}
              onDecline={() => setCashDecision(false)}
              onReset={() => setCashDecision(null)}
            />
          ) : null}

          {/* Delivery swipe: for pharma, only shown after pharma checks pass.
              For COD orders, only after the courier has made an explicit cash
              decision (confirmed OR declined). */}
          {(vertical === 'restaurant' || pharmaOk) &&
          (!isCashOnDelivery || cashDecision !== null) ? (
            <div className={geofenceState === 'NEAR_DROPOFF' ? 'space-y-2' : ''}>
              {geofenceState === 'NEAR_DROPOFF' && (
                <ArrivalHint label="Ești la adresa de livrare — glisează pentru a confirma ↓" />
              )}
              <SwipeButton
                label="→ Glisează pentru a confirma livrare"
                onConfirm={handleDeliverConfirm}
                variant="success"
              />
            </div>
          ) : null}
        </>
      ) : null}

      {/* Courier-initiated cancellation: only ACCEPTED or PICKED_UP.
          IN_TRANSIT is excluded — at that distance the courier should
          contact the dispatcher via QuickCallButtons instead. */}
      {isMine && (status === 'ACCEPTED' || status === 'PICKED_UP') ? (
        <CancelOrderModal cancelAction={cancelAction} />
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
 * Compact cash-collected gate. Three states:
 *   - decision=null   → prompt with [DA] + [NU] buttons; swipe is gated.
 *   - decision=true   → green "Cash încasat: {amount}" row + "Modifică" link.
 *   - decision=false  → amber warning "Cash neîncasat" row + "Modifică" link.
 *                       Swipe unlocks so delivery can still be marked complete,
 *                       but the server flags the restaurant_orders row for admin
 *                       review (cod_status = PENDING_ADMIN_REVIEW).
 *
 * Pure UI gate: no server call here. The flag is passed at delivered-action
 * time and the server writes cod_status + flips payment_status when collected.
 */
function CashCollectedGate({
  amountLabel,
  decision,
  onConfirm,
  onDecline,
  onReset,
}: {
  amountLabel: string;
  decision: boolean | null;
  onConfirm: () => void;
  onDecline: () => void;
  onReset: () => void;
}) {
  if (decision === true) {
    return (
      <div className="flex items-center justify-between rounded-2xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm ring-1 ring-inset ring-emerald-500/20 shadow-sm shadow-emerald-500/10">
        <span className="flex items-center gap-2 text-emerald-200">
          <Banknote className="h-4 w-4" aria-hidden strokeWidth={2.25} />
          Cash încasat: <span className="font-semibold tabular-nums">{amountLabel}</span>
        </span>
        <Button
          type="button"
          variant="ghost"
          onClick={onReset}
          className="h-auto p-0 text-xs text-hir-muted-fg transition-colors hover:bg-transparent hover:text-hir-fg focus-visible:outline-2 focus-visible:outline-violet-500 focus-visible:outline-offset-2 rounded"
        >
          Modifică
        </Button>
      </div>
    );
  }

  if (decision === false) {
    return (
      <div className="flex items-center justify-between rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm ring-1 ring-inset ring-rose-500/20 shadow-sm shadow-rose-500/10">
        <span className="flex items-center gap-2 text-rose-200">
          <Banknote className="h-4 w-4" aria-hidden strokeWidth={2.25} />
          Cash neîncasat — admin va fi notificat
        </span>
        <Button
          type="button"
          variant="ghost"
          onClick={onReset}
          className="h-auto p-0 text-xs text-hir-muted-fg transition-colors hover:bg-transparent hover:text-hir-fg focus-visible:outline-2 focus-visible:outline-violet-500 focus-visible:outline-offset-2 rounded"
        >
          Modifică
        </Button>
      </div>
    );
  }

  // decision=null: show the prompt
  return (
    <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 ring-1 ring-inset ring-amber-500/20 shadow-sm shadow-amber-500/10">
      <div className="flex items-start gap-2.5">
        <span
          aria-hidden
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-500/20 ring-1 ring-amber-500/40 shadow-sm shadow-amber-500/20"
        >
          <Banknote className="h-4 w-4 text-amber-300" strokeWidth={2.25} />
        </span>
        <div className="flex-1">
          <p className="text-sm font-semibold text-amber-100">
            Confirmă încasare numerar — {amountLabel}
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-amber-200/90">
            Ai primit banii de la client?
          </p>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <Button
          type="button"
          onClick={onConfirm}
          className="flex-1 rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-semibold text-amber-950 shadow-md shadow-amber-500/30 transition-all hover:-translate-y-px hover:bg-amber-400 hover:shadow-lg hover:shadow-amber-500/40 active:translate-y-0 focus-visible:outline-2 focus-visible:outline-amber-400 focus-visible:outline-offset-2"
        >
          DA
        </Button>
        <Button
          type="button"
          onClick={onDecline}
          className="rounded-xl border border-hir-border bg-hir-surface px-4 py-2.5 text-sm font-semibold text-hir-fg shadow-sm transition-all hover:bg-hir-border/30 focus-visible:outline-2 focus-visible:outline-violet-500 focus-visible:outline-offset-2"
        >
          NU
        </Button>
      </div>
    </div>
  );
}
