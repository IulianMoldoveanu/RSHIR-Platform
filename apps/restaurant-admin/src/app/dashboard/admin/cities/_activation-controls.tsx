'use client';

// Client controls for /dashboard/admin/cities — flip the platform go-live flag
// per city, and a one-click "activate all county capitals" baseline. Mirrors
// the useTransition + router.refresh pattern of the tenants suspend toggle.

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { setCityActive, activateCountyCapitals } from './actions';

export function CityActiveToggle({
  cityId,
  isActive,
}: {
  cityId: string;
  isActive: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onClick() {
    setError(null);
    startTransition(async () => {
      const res = await setCityActive({ cityId, active: !isActive });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <span className="inline-flex flex-col items-end gap-0.5">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className={
          isActive
            ? 'text-xs font-medium text-zinc-500 hover:underline disabled:opacity-50'
            : 'text-xs font-medium text-emerald-700 hover:underline disabled:opacity-50'
        }
        aria-label={isActive ? 'Dezactivează oraș' : 'Activează oraș'}
      >
        {pending ? '…' : isActive ? 'Dezactivează' : 'Activează'}
      </button>
      {error && <span className="text-[10px] text-rose-600">{error}</span>}
    </span>
  );
}

export function ActivateCapitalsButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function onClick() {
    if (
      typeof window !== 'undefined' &&
      !window.confirm(
        'Activați toate cele 41 de capitale de județ (reședințe + București)? '
          + 'Vor deveni vizibile public și veți putea asigna vendori în ele.',
      )
    ) {
      return;
    }
    setError(null);
    setMsg(null);
    startTransition(async () => {
      const res = await activateCountyCapitals();
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setMsg(`${res.activated ?? 0} capitale active.`);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="rounded-md border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-medium text-violet-700 hover:bg-violet-100 disabled:opacity-50"
      >
        {pending ? 'Se activează…' : 'Activează capitalele de județ'}
      </button>
      {msg && <span className="text-[11px] text-emerald-600">{msg}</span>}
      {error && <span className="text-[11px] text-rose-600">{error}</span>}
    </div>
  );
}
