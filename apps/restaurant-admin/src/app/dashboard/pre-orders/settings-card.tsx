'use client';

import { useState, useTransition } from 'react';
import { CheckCircle2, AlertCircle } from 'lucide-react';
import type { PreOrderSettings } from './settings';
import { savePreOrderSettings } from './actions';

export function PreOrderSettingsCard({
  tenantId,
  settings,
}: {
  tenantId: string;
  settings: PreOrderSettings;
}) {
  const [enabled, setEnabled] = useState(settings.enabled);
  const [minHours, setMinHours] = useState(settings.min_advance_hours);
  const [maxDays, setMaxDays] = useState(settings.max_advance_days);
  const [minSubtotal, setMinSubtotal] = useState(settings.min_subtotal_ron);

  const [pending, start] = useTransition();
  const [feedback, setFeedback] = useState<
    | { kind: 'ok'; message: string }
    | { kind: 'error'; message: string }
    | null
  >(null);

  function onSave() {
    setFeedback(null);
    start(async () => {
      const result = await savePreOrderSettings(tenantId, {
        enabled,
        min_advance_hours: minHours,
        max_advance_days: maxDays,
        min_subtotal_ron: minSubtotal,
      });
      if (result.ok) {
        setFeedback({ kind: 'ok', message: 'Setările au fost salvate.' });
      } else {
        setFeedback({
          kind: 'error',
          message: errorMessage(result.error),
        });
      }
    });
  }

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-5">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-zinc-900">
            Configurare pre-comenzi
          </h2>
          <p className="mt-1 text-xs text-zinc-600">
            Activați și apare butonul către{' '}
            <code className="rounded bg-zinc-100 px-1 py-0.5 text-[11px]">
              /pre-comanda
            </code>{' '}
            pe storefront-ul restaurantului.
          </p>
        </div>
        <label className="relative inline-flex shrink-0 cursor-pointer items-center">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="peer sr-only"
          />
          <span className="h-6 w-11 rounded-full bg-zinc-200 transition-colors peer-checked:bg-emerald-500" />
          <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
        </label>
      </header>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-xs font-medium text-zinc-700">
          Minim în avans (ore)
          <input
            type="number"
            min={1}
            max={720}
            value={minHours}
            onChange={(e) =>
              setMinHours(Math.max(1, Math.min(720, Number(e.target.value) || 1)))
            }
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-normal text-zinc-900 focus:border-zinc-900 focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-zinc-700">
          Maxim în avans (zile)
          <input
            type="number"
            min={1}
            max={60}
            value={maxDays}
            onChange={(e) =>
              setMaxDays(Math.max(1, Math.min(60, Number(e.target.value) || 1)))
            }
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-normal text-zinc-900 focus:border-zinc-900 focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-zinc-700">
          Subtotal minim (RON)
          <input
            type="number"
            min={0}
            max={100000}
            step={1}
            value={minSubtotal}
            onChange={(e) =>
              setMinSubtotal(
                Math.max(0, Math.min(100_000, Number(e.target.value) || 0)),
              )
            }
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-normal text-zinc-900 focus:border-zinc-900 focus:outline-none"
          />
        </label>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-xs text-zinc-500">
          Default: pre-comenzile sunt dezactivate. Activați după ce sunteți gata
          să primiți comenzi pentru evenimente.
        </p>
        <button
          type="button"
          onClick={onSave}
          disabled={pending}
          className="inline-flex items-center justify-center rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
        >
          {pending ? 'Se salvează...' : 'Salvează'}
        </button>
      </div>

      {feedback && (
        <div
          className={`mt-3 flex items-start gap-2 rounded-md px-3 py-2 text-sm ${
            feedback.kind === 'ok'
              ? 'border border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border border-rose-200 bg-rose-50 text-rose-800'
          }`}
        >
          {feedback.kind === 'ok' ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
          ) : (
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}
    </section>
  );
}

function errorMessage(code: string): string {
  switch (code) {
    case 'forbidden_owner_only':
      return 'Doar OWNER poate modifica aceste setări.';
    case 'invalid_input':
      return 'Datele introduse sunt invalide.';
    case 'tenant_mismatch':
      return 'Restaurantul activ s-a schimbat. Reîncărcați pagina.';
    case 'unauthenticated':
      return 'Sesiunea a expirat. Reconectați-vă.';
    default:
      return 'Eroare la salvare. Vă rugăm încercați din nou.';
  }
}
