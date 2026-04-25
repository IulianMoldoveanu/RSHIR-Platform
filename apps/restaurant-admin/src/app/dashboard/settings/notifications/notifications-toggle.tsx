'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setEmailNotificationsAction } from './actions';

type Props = {
  canEdit: boolean;
  initialEnabled: boolean;
};

export function NotificationsToggle({ canEdit, initialEnabled }: Props) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const toggle = () => {
    if (!canEdit || pending) return;
    const next = !enabled;
    setError(null);
    start(async () => {
      const r = await setEmailNotificationsAction(next);
      if (!r.ok) {
        setError(r.detail ?? r.error ?? 'Eroare necunoscută');
        return;
      }
      setEnabled(next);
      router.refresh();
    });
  };

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-zinc-900">
            Email la comandă plătită
          </p>
          <p className="mt-1 text-xs text-zinc-600">
            Adresa folosită este cea cu care te-ai înregistrat (rol OWNER).
            Dezactivează dacă primești deja notificări pe alt canal.
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
