'use client';
// OWNER-gated payment-mode picker. Wraps the setPaymentMode server action
// in a small radio + Save form. Visual feedback inline; no router.refresh()
// needed — revalidatePath('/dashboard/settings/payments') in the action
// re-renders the page.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setPaymentMode, type PaymentMode, type SetPaymentModeResult } from './actions';

type Feedback = { kind: 'success' | 'error'; message: string } | null;

function errorLabel(result: Extract<SetPaymentModeResult, { ok: false }>): string {
  const map: Record<string, string> = {
    forbidden_owner_only: 'Doar OWNER poate schimba modul de plată.',
    unauthenticated: 'Sesiune expirată — autentificați-vă din nou.',
    invalid_input: 'Mod invalid.',
    tenant_mismatch: 'Restaurantul activ s-a schimbat — reîncărcați pagina.',
    db_error: 'Eroare la salvare.',
  };
  return map[result.error] ?? result.error;
}

const OPTIONS: { value: PaymentMode; label: string; description: string }[] = [
  {
    value: 'cod_only',
    label: 'Doar plata la livrare',
    description:
      'Implicit pentru tenants noi. Storefront-ul ascunde plata cu cardul; toate comenzile sunt cash la livrare.',
  },
  {
    value: 'card_test',
    label: 'Plată card — mod demo (Stripe test)',
    description:
      'Pentru pitch-uri și onboarding. Acceptă cardul de test 4242 4242 4242 4242. Storefront afișează banner "Plată în mod demo". Nu se procesează bani reali.',
  },
  {
    value: 'card_live',
    label: 'Plată card — live',
    description:
      'Activează doar după ce credențialele Netopia/Viva sau Stripe live sunt configurate. Tranzacții reale; fără banner demo.',
  },
];

export function PaymentModeClient({
  tenantId,
  canEdit,
  currentMode,
}: {
  tenantId: string;
  canEdit: boolean;
  currentMode: PaymentMode;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [selected, setSelected] = useState<PaymentMode>(currentMode);
  const [feedback, setFeedback] = useState<Feedback>(null);

  function save() {
    if (!canEdit || pending || selected === currentMode) return;
    setFeedback(null);
    const fd = new FormData();
    fd.set('mode', selected);
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
      <h2 className="text-sm font-semibold text-zinc-900">
        Mod plată storefront
      </h2>
      <p className="mt-1 text-xs text-zinc-600">
        Controlează ce metode de plată sunt afișate pe pagina de checkout a
        storefront-ului. Schimbarea are efect imediat la următoarea încărcare a
        paginii.
      </p>

      <fieldset className="mt-4 flex flex-col gap-2" disabled={!canEdit || pending}>
        {OPTIONS.map((opt) => (
          <label
            key={opt.value}
            className={`flex cursor-pointer items-start gap-3 rounded-lg border px-4 py-3 transition-colors ${
              selected === opt.value
                ? 'border-purple-600 bg-purple-50'
                : 'border-zinc-200 bg-white hover:bg-zinc-50'
            } ${!canEdit ? 'cursor-not-allowed opacity-60' : ''}`}
          >
            <input
              type="radio"
              name="payment_mode"
              value={opt.value}
              checked={selected === opt.value}
              onChange={() => setSelected(opt.value)}
              className="mt-1"
            />
            <span className="flex flex-col">
              <span className="text-sm font-medium text-zinc-900">{opt.label}</span>
              <span className="mt-0.5 text-xs text-zinc-600">{opt.description}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={!canEdit || pending || selected === currentMode}
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
