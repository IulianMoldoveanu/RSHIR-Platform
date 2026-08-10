'use client';

// Client wrapper around acceptOfferAction. Confirms before sending so the
// vendor doesn't fat-finger an accept (it's terminal — moves the listing to
// MATCHED). Surface errors inline; on success Next refreshes the route so
// the offer table reflects the new state.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { acceptOfferAction } from '../../actions';
import { buttonClass } from '@/app/marketplace/_components/ui';

type Props = {
  offerId: string;
  listingId: string;
};

export function OfferActions({ offerId, listingId }: Props): JSX.Element {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function onAccept(): Promise<void> {
    if (typeof window !== 'undefined') {
      const ok = window.confirm(
        'Acceptă oferta? Cererea trece la „Atribuit" și nu mai poate fi modificată.',
      );
      if (!ok) return;
    }
    setError(null);
    const result = await acceptOfferAction({ offerId, listingId });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => startTransition(() => void onAccept())}
        disabled={isPending}
        className={buttonClass('accept', 'sm')}
      >
        {isPending ? 'Se acceptă…' : 'Acceptă'}
      </button>
      {error ? (
        <span role="alert" className="max-w-[220px] text-right text-[11px] text-rose-700">
          {error}
        </span>
      ) : null}
    </div>
  );
}
