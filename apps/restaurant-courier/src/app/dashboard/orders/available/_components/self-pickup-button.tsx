'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Hand, Check, AlertTriangle } from 'lucide-react';

type State = 'idle' | 'submitting' | 'claimed' | 'race' | 'limit' | 'error';

export function SelfPickupButton({
  orderId,
  disabled,
  onClaimed,
}: {
  orderId: string;
  disabled: boolean;
  onClaimed: () => void;
}) {
  const [state, setState] = useState<State>('idle');
  const [, startTransition] = useTransition();
  const router = useRouter();

  async function handleClick() {
    if (disabled || state === 'submitting' || state === 'claimed') return;
    setState('submitting');
    try {
      const res = await fetch(`/api/orders/${orderId}/self-pickup`, {
        method: 'POST',
        credentials: 'same-origin',
      });
      if (res.ok) {
        setState('claimed');
        if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
          navigator.vibrate?.(120);
        }
        startTransition(() => {
          onClaimed();
          router.push(`/dashboard/orders/${orderId}`);
        });
        return;
      }
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.status === 409 || body.error === 'already_taken') {
        setState('race');
        startTransition(() => onClaimed());
        return;
      }
      if (res.status === 422 || body.error === 'limit_reached') {
        setState('limit');
        return;
      }
      setState('error');
    } catch {
      setState('error');
    }
  }

  if (state === 'claimed') {
    return (
      <div className="flex items-center justify-center gap-2 rounded-lg bg-emerald-500/15 px-4 py-3 text-sm font-semibold text-emerald-200">
        <Check className="h-4 w-4" aria-hidden />
        Comanda e a ta — se deschide…
      </div>
    );
  }
  if (state === 'race') {
    return (
      <div className="flex items-center justify-center gap-2 rounded-lg bg-amber-500/15 px-4 py-3 text-sm font-medium text-amber-200">
        <AlertTriangle className="h-4 w-4" aria-hidden />
        Luată deja de alt curier
      </div>
    );
  }
  if (state === 'limit') {
    return (
      <div className="rounded-lg bg-rose-500/15 px-4 py-3 text-center text-sm font-medium text-rose-200">
        Limita ta de comenzi paralele a fost atinsă
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || state === 'submitting'}
      aria-label="Iau comanda"
      className="flex w-full min-h-[56px] items-center justify-center gap-2 rounded-lg bg-violet-500 px-4 py-3 text-base font-bold text-white shadow-md shadow-violet-500/30 transition-all hover:bg-violet-400 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-violet-300 focus-visible:outline-offset-2"
    >
      <Hand className="h-5 w-5" aria-hidden />
      {state === 'submitting' ? 'Iau…' : state === 'error' ? 'Reîncearcă' : 'IAU COMANDA'}
    </button>
  );
}
