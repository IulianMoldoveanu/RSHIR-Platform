'use client';

import { useState } from 'react';
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
  acceptAction: () => Promise<void>;
  pickedUpAction: () => Promise<void>;
  /** Server action that accepts an optional proof URL. */
  deliveredAction: (proofUrl?: string) => Promise<void>;
};

export function OrderActions({
  orderId,
  status,
  isMine,
  isAvailable,
  vertical,
  pharmaMetadata,
  acceptAction,
  pickedUpAction,
  deliveredAction,
}: Props) {
  const [pharmaOk, setPharmaOk] = useState(false);
  const [pharmaProofUrl, setPharmaProofUrl] = useState<string | undefined>(undefined);
  const [restaurantProofUrl, setRestaurantProofUrl] = useState<string | undefined>(undefined);

  const isDeliveryPhase = isMine && (status === 'PICKED_UP' || status === 'IN_TRANSIT');

  function handlePharmaComplete(urls: { delivery?: string; id?: string; prescription?: string }) {
    setPharmaOk(true);
    if (urls.delivery) setPharmaProofUrl(urls.delivery);
  }

  function handleRestaurantPhotoComplete(urls: { delivery?: string }) {
    setRestaurantProofUrl(urls.delivery);
  }

  async function handleDeliverConfirm() {
    const proofUrl = vertical === 'pharma' ? pharmaProofUrl : restaurantProofUrl;
    await deliveredAction(proofUrl);
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

          {/* Delivery swipe: for pharma, only shown after pharma checks pass. */}
          {vertical === 'restaurant' || pharmaOk ? (
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
