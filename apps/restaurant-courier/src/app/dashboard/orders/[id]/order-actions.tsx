'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { Banknote, Info } from 'lucide-react';
import { SwipeButton } from '@/components/swipe-button';
import { Button } from '@hir/ui';
import type { PharmaMetadata } from '@/components/pharma-checks';
import { PhotoProofUpload } from '@/components/photo-proof-upload';
import { useRiderMode } from '@/components/rider-mode-provider';
import { runTransitionOrQueue } from '@/lib/transition-runner';

// PharmaChecks is only rendered for vertical==='pharma' orders — lazy-load
// so the camera/photo-upload logic doesn't inflate the default order-detail
// bundle for the 90%+ of restaurant orders.
const PharmaChecks = dynamic(
  () => import('@/components/pharma-checks').then((m) => ({ default: m.PharmaChecks })),
  { ssr: false },
);

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
}: Props) {
  const [pharmaOk, setPharmaOk] = useState(false);
  const [pharmaProofUrl, setPharmaProofUrl] = useState<string | undefined>(undefined);
  const [pharmaIdUrl, setPharmaIdUrl] = useState<string | undefined>(undefined);
  const [pharmaRxUrl, setPharmaRxUrl] = useState<string | undefined>(undefined);
  const [restaurantProofUrl, setRestaurantProofUrl] = useState<string | undefined>(undefined);
  const [cashConfirmed, setCashConfirmed] = useState(false);

  const { mode, fleetName } = useRiderMode();
  const acceptLabel = '→ Glisează pentru a accepta comanda';

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
      <div className="flex items-start gap-2 rounded-2xl border border-hir-border bg-hir-surface p-4 text-sm">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-hir-muted-fg" aria-hidden />
        <div className="flex-1">
          <p className="font-medium text-hir-fg">Vizualizare doar-citire</p>
          <p className="mt-0.5 text-xs text-hir-muted-fg">
            {fleetName
              ? `Folosiți aplicația flotei „${fleetName}" pentru a actualiza starea comenzii.`
              : 'Folosiți aplicația flotei dumneavoastră pentru a actualiza starea comenzii.'}
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
    const cashCollected = isCashOnDelivery ? cashConfirmed : undefined;
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
  }

  return (
    <div className="flex flex-col gap-3">
      {isAvailable ? (
        <SwipeButton label={acceptLabel} onConfirm={handleAcceptConfirm} />
      ) : null}

      {isMine && status === 'ACCEPTED' ? (
        <SwipeButton
          label="→ Glisează pentru a confirma ridicare"
          onConfirm={handlePickedUpConfirm}
        />
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
              confirmed={cashConfirmed}
              onConfirm={() => setCashConfirmed(true)}
              onReset={() => setCashConfirmed(false)}
            />
          ) : null}

          {/* Delivery swipe: for pharma, only shown after pharma checks pass.
              For COD orders, only after the cash gate is confirmed. */}
          {(vertical === 'restaurant' || pharmaOk) &&
          (!isCashOnDelivery || cashConfirmed) ? (
            <SwipeButton
              label="→ Glisează pentru a confirma livrare"
              onConfirm={handleDeliverConfirm}
              variant="success"
            />
          ) : null}
        </>
      ) : null}
    </div>
  );
}

/**
 * Compact cash-collected gate. Two states:
 *   - unconfirmed → big "Da, am încasat {amount}" button + small "Nu" link.
 *   - confirmed → green check row "Cash încasat: {amount}" with a "Modifică" link.
 *
 * Pure UI gate: no server call here. The flag is passed at delivered-action
 * time and the server logs an audit row when COD + cashCollected=true.
 */
function CashCollectedGate({
  amountLabel,
  confirmed,
  onConfirm,
  onReset,
}: {
  amountLabel: string;
  confirmed: boolean;
  onConfirm: () => void;
  onReset: () => void;
}) {
  if (confirmed) {
    return (
      <div className="flex items-center justify-between rounded-2xl border border-emerald-700/40 bg-emerald-950/40 px-4 py-3 text-sm">
        <span className="flex items-center gap-2 text-emerald-300">
          <Banknote className="h-4 w-4" aria-hidden />
          Cash încasat: <span className="font-semibold">{amountLabel}</span>
        </span>
        <Button
          type="button"
          variant="ghost"
          onClick={onReset}
          className="h-auto p-0 text-xs text-zinc-400 hover:text-zinc-200"
        >
          Modifică
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-amber-700/40 bg-amber-950/30 p-4">
      <div className="flex items-start gap-2">
        <Banknote className="mt-0.5 h-4 w-4 text-amber-300" aria-hidden />
        <div className="flex-1">
          <p className="text-sm font-medium text-amber-100">
            Plată cash la livrare
          </p>
          <p className="mt-0.5 text-xs text-amber-200/80">
            Confirmă că ai încasat{' '}
            <span className="font-semibold">{amountLabel}</span> de la client
            înainte de a marca livrarea.
          </p>
        </div>
      </div>
      <Button
        type="button"
        onClick={onConfirm}
        className="mt-3 w-full rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-semibold text-amber-950 hover:bg-amber-400"
      >
        Da, am încasat {amountLabel}
      </Button>
    </div>
  );
}
