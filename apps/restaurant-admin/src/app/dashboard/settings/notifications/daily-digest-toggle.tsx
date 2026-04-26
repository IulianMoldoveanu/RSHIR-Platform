'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setDailyDigestEnabledAction } from './actions';

type Props = {
  canEdit: boolean;
  initialEnabled: boolean;
  tenantId: string;
};

export function DailyDigestToggle({ canEdit, initialEnabled, tenantId }: Props) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const toggle = () => {
    if (!canEdit || pending) return;
    const next = !enabled;
    setError(null);
    start(async () => {
      const r = await setDailyDigestEnabledAction(next, tenantId);
      if (!r.ok) {
        setError(r.detail ?? r.error ?? 'Eroare necunoscută');
        return;
      }
      setEnabled(next);
      router.refresh();
    });
  };

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-zinc-900">
            Raport zilnic prin email
          </p>
          <p className="mt-1 text-xs text-zinc-600">
            În fiecare dimineață primești un rezumat al zilei anterioare:
            total încasat, număr comenzi, top articole, oră de vârf.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          disabled={!canEdit || pending}
          onClick={toggle}
          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
            enabled ? 'bg-emerald-500' : 'bg-zinc-300'
          }`}
        >
          <span
            className={`absolute top-0.5 inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
              enabled ? 'translate-x-5' : 'translate-x-0.5'
            }`}
          />
        </button>
      </div>
      {error && (
        <p className="mt-3 text-xs text-rose-700">Eroare: {error}</p>
      )}
    </section>
  );
}
