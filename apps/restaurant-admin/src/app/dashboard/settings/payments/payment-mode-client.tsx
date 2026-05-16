'use client';
// OWNER-gated payment-mode + provider picker. Wraps the setPaymentMode server
// action in a small radio + Save form. Visual feedback inline; no
// router.refresh() needed — revalidatePath('/dashboard/settings/payments') in
// the action re-renders the page.
//
// Iulian directive 2026-05-16: Stripe is excluded. Only Netopia and Viva
// Wallet are valid card providers. Provider radios are hidden when mode is
// cod_only (no provider needed).

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  setPaymentMode,
  type PaymentMode,
  type PaymentProvider,
  type SetPaymentModeResult,
} from './actions';

type Feedback = { kind: 'success' | 'error'; message: string } | null;

function errorLabel(result: Extract<SetPaymentModeResult, { ok: false }>): string {
  const map: Record<string, string> = {
    forbidden_owner_only: 'Doar OWNER poate schimba modul de plată.',
    unauthenticated: 'Sesiune expirată — autentificați-vă din nou.',
    invalid_input:
      result.detail === 'provider'
        ? 'Alegeți procesatorul de plată (Netopia sau Viva).'
        : 'Mod invalid.',
    tenant_mismatch: 'Restaurantul activ s-a schimbat — reîncărcați pagina.',
    db_error: 'Eroare la salvare.',
  };
  return map[result.error] ?? result.error;
}

const MODE_OPTIONS: { value: PaymentMode; label: string; description: string }[] = [
  {
    value: 'cod_only',
    label: 'Doar plata la livrare',
    description:
      'Implicit pentru tenants noi. Storefront-ul ascunde plata cu cardul; toate comenzile sunt cash la livrare.',
  },
  {
    value: 'card_sandbox',
    label: 'Plată card — mod sandbox',
    description:
      'Pentru pitch-uri și onboarding. Se folosesc cardurile de test ale procesatorului ales (Netopia sau Viva). Storefront afișează banner "Plată în mod sandbox". Nu se procesează bani reali.',
  },
  {
    value: 'card_live',
    label: 'Plată card — live',
    description:
      'Activează doar după ce credențialele Netopia sau Viva live sunt configurate. Tranzacții reale; fără banner sandbox.',
  },
];

const PROVIDER_OPTIONS: { value: PaymentProvider; label: string; hint: string }[] = [
  {
    value: 'netopia',
    label: 'Netopia',
    hint: 'Procesator RO-native, recomandat pentru clientela locală.',
  },
  {
    value: 'viva',
    label: 'Viva Wallet',
    hint: 'Alternativă RO + UE. Selectați după ce credențialele Viva sunt configurate.',
  },
];

export function PaymentModeClient({
  tenantId,
  canEdit,
  currentMode,
  currentProvider,
}: {
  tenantId: string;
  canEdit: boolean;
  currentMode: PaymentMode;
  currentProvider: PaymentProvider;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [selectedMode, setSelectedMode] = useState<PaymentMode>(currentMode);
  const [selectedProvider, setSelectedProvider] = useState<PaymentProvider>(currentProvider);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const dirty =
    selectedMode !== currentMode ||
    (selectedMode !== 'cod_only' && selectedProvider !== currentProvider);

  function save() {
    if (!canEdit || pending || !dirty) return;
    setFeedback(null);
    const fd = new FormData();
    fd.set('mode', selectedMode);
    if (selectedMode !== 'cod_only') {
      fd.set('provider', selectedProvider);
    }
    fd.set('tenantId', tenantId);
    start(async () => {
      const result = await setPaymentMode(fd);
      if (result.ok) {
        setFeedback({ kind: 'success', message: 'Mod salvat.' });
        router.refresh();
      } else {
        setFeedback({ kind: 'error', message: errorLabel(result) });
      }
    });
  }

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-5">
      <h2 className="text-sm font-semibold text-zinc-900">Mod plată storefront</h2>
      <p className="mt-1 text-xs text-zinc-600">
        Controlează ce metode de plată sunt afișate pe pagina de checkout a
        storefront-ului. Schimbarea are efect imediat la următoarea încărcare a
        paginii.
      </p>

      <fieldset className="mt-4 flex flex-col gap-2" disabled={!canEdit || pending}>
        {MODE_OPTIONS.map((opt) => (
          <label
            key={opt.value}
            className={`flex cursor-pointer items-start gap-3 rounded-lg border px-4 py-3 transition-colors ${
              selectedMode === opt.value
                ? 'border-purple-600 bg-purple-50'
                : 'border-zinc-200 bg-white hover:bg-zinc-50'
            } ${!canEdit ? 'cursor-not-allowed opacity-60' : ''}`}
          >
            <input
              type="radio"
              name="payment_mode"
              value={opt.value}
              checked={selectedMode === opt.value}
              onChange={() => setSelectedMode(opt.value)}
              className="mt-1"
            />
            <span className="flex flex-col">
              <span className="text-sm font-medium text-zinc-900">{opt.label}</span>
              <span className="mt-0.5 text-xs text-zinc-600">{opt.description}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {selectedMode !== 'cod_only' && (
        <fieldset
          className="mt-4 flex flex-col gap-2 rounded-lg border border-zinc-200 bg-zinc-50/40 p-4"
          disabled={!canEdit || pending}
        >
          <legend className="px-1 text-xs font-semibold uppercase tracking-wider text-zinc-700">
            Procesator
          </legend>
          {PROVIDER_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className={`flex cursor-pointer items-start gap-3 rounded-lg border px-4 py-3 transition-colors ${
                selectedProvider === opt.value
                  ? 'border-purple-600 bg-purple-50'
                  : 'border-zinc-200 bg-white hover:bg-zinc-50'
              } ${!canEdit ? 'cursor-not-allowed opacity-60' : ''}`}
            >
              <input
                type="radio"
                name="payment_provider"
                value={opt.value}
                checked={selectedProvider === opt.value}
                onChange={() => setSelectedProvider(opt.value)}
                className="mt-1"
              />
              <span className="flex flex-col">
                <span className="text-sm font-medium text-zinc-900">{opt.label}</span>
                <span className="mt-0.5 text-xs text-zinc-600">{opt.hint}</span>
              </span>
            </label>
          ))}
        </fieldset>
      )}

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={!canEdit || pending || !dirty}
          className="rounded-md bg-purple-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-700 disabled:opacity-50"
        >
          {pending ? 'Se salvează…' : 'Salvează modul'}
        </button>
        {feedback && (
          <p
            className={
              feedback.kind === 'success'
                ? 'text-xs text-emerald-700'
                : 'text-xs text-rose-700'
            }
          >
            {feedback.message}
          </p>
        )}
      </div>
    </section>
  );
}
