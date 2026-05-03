'use client';

import { useState } from 'react';
import { Banknote } from 'lucide-react';
import { SwipeButton } from '@/components/swipe-button';
import { PharmaChecks, type PharmaMetadata } from '@/components/pharma-checks';
import { PhotoProofUpload } from '@/components/photo-proof-upload';

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
   * Server action that accepts an optional proof URL and an optional
   * cash_collected flag (only meaningful when payment_method=COD).
   */
  deliveredAction: (proofUrl?: string, cashCollected?: boolean) => Promise<void>;
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
  const [restaurantProofUrl, setRestaurantProofUrl] = useState<string | undefined>(undefined);
  const [cashConfirmed, setCashConfirmed] = useState(false);

  const isDeliveryPhase = isMine && (status === 'PICKED_UP' || status === 'IN_TRANSIT');
  const isCashOnDelivery = paymentMethod === 'COD';
  const cashAmountLabel = totalRon != null ? `${Number(totalRon).toFixed(2)} RON` : 'suma datorată';

  function handlePharmaComplete(urls: { delivery?: string; id?: string; prescription?: string }) {
    setPharmaOk(true);
    if (urls.delivery) setPharmaProofUrl(urls.delivery);
  }

  function handleRestaurantPhotoComplete(urls: { delivery?: string }) {
    setRestaurantProofUrl(urls.delivery);
  }

  async function handleDeliverConfirm() {
    const proofUrl = vertical === 'pharma' ? pharmaProofUrl : restaurantProofUrl;
    await deliveredAction(proofUrl, isCashOnDelivery ? cashConfirmed : undefined);
  }

  return (
    <div className="flex flex-col gap-3">
      {isAvailable ? (
        <SwipeButton label="→ Glisează pentru a accepta" onConfirm={acceptAction} />
      ) : null}

      {isMine && status === 'ACCEPTED' ? (
        <SwipeButton
          label="→ Glisează pentru a confirma ridicare"
          onConfirm={pickedUpAction}
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
        <button
          type="button"
          onClick={onReset}
          className="text-xs text-zinc-400 underline-offset-2 hover:text-zinc-200 hover:underline"
        >
          Modifică
        </button>
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
      <button
        type="button"
        onClick={onConfirm}
        className="mt-3 w-full rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-semibold text-amber-950 hover:bg-amber-400 active:bg-amber-600"
      >
        Da, am încasat {amountLabel}
      </button>
    </div>
  );
}
