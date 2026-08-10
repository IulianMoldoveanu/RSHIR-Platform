'use client';

// Cancel-listing button. Confirms before calling cancelListingAction. After a
// successful cancel the vendor goes back to the listings index so they're not
// stranded on a CANCELLED detail page.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { cancelListingAction } from '../../actions';
import { buttonClass } from '@/app/marketplace/_components/ui';

type Props = {
  listingId: string;
};

export function CancelButtonClient({ listingId }: Props): JSX.Element {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function onCancel(): Promise<void> {
    if (typeof window !== 'undefined') {
      const ok = window.confirm(
        'Anulează cererea? Flotele nu vor mai putea trimite oferte. Acțiunea nu poate fi revenită.',
      );
      if (!ok) return;
    }
    setError(null);
    const result = await cancelListingAction(listingId);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.push('/marketplace/listings');
    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => startTransition(() => void onCancel())}
        disabled={isPending}
        className={buttonClass('danger', 'sm')}
      >
        {isPending ? 'Se anulează…' : 'Anulează cererea'}
      </button>
      {error ? (
        <span role="alert" className="max-w-[220px] text-right text-[11px] text-rose-700">
          {error}
        </span>
      ) : null}
    </div>
  );
}
