'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { submitStripeOnboardingRequest, type SubmitResult } from './actions';

type RequestRow = {
  id: string;
  business_name: string;
  vat_number: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  notes: string | null;
  created_at: string;
};

type Feedback = { kind: 'success' | 'error'; message: string } | null;

function errorLabel(result: Extract<SubmitResult, { ok: false }>): string {
  const map: Record<string, string> = {
    forbidden_owner_only: 'Doar OWNER poate trimite cererea.',
    unauthenticated: 'Sesiune expirată — autentificați-vă din nou.',
    invalid_input: 'Date invalide. Verificați numele și CUI-ul.',
    tenant_mismatch: 'Restaurantul activ s-a schimbat — reîncărcați pagina.',
    db_error: 'Eroare la salvarea cererii.',
  };
  const base = map[result.error] ?? result.error;
  return result.detail ? `${base} (${result.detail})` : base;
}

export function PaymentsClient({
  tenantId,
  canEdit,
  latestRequest,
  defaultBusinessName,
}: {
  tenantId: string;
  canEdit: boolean;
  latestRequest: RequestRow | null;
  defaultBusinessName: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [businessName, setBusinessName] = useState(
    latestRequest?.business_name ?? defaultBusinessName ?? '',
  );
  const [vatNumber, setVatNumber] = useState(latestRequest?.vat_number ?? '');
  const [feedback, setFeedback] = useState<Feedback>(null);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canEdit) return;
    setFeedback(null);
    const fd = new FormData();
    fd.set('business_name', businessName.trim());
    fd.set('vat_number', vatNumber.trim());
    fd.set('tenantId', tenantId);
    start(async () => {
      const result = await submitStripeOnboardingRequest(fd);
      if (result.ok) {
        setFeedback({
          kind: 'success',
          message:
            'Cerere trimisă. Echipa HIR vă contactează în 1-2 zile lucrătoare.',
        });
        router.refresh();
      } else {
        setFeedback({ kind: 'error', message: errorLabel(result) });
      }
    });
  }

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-5">
      <h2 className="text-sm font-semibold text-zinc-900">
        Solicitare activare Stripe
      </h2>
      <p className="mt-1 text-xs text-zinc-600">
        Stripe Connect se configurează la nivel de platformă. Trimiteți datele
        firmei și echipa HIR finalizează configurarea în 1-2 zile lucrătoare.
      </p>

      {latestRequest && <RequestStatusBanner request={latestRequest} />}

      <form onSubmit={submit} className="mt-4 flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="business_name" className="text-xs font-medium text-zinc-700">
            Denumire firmă (PFA / SRL)
          </label>
          <input
            id="business_name"
            type="text"
            required
            disabled={!canEdit || pending}
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            maxLength={200}
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none disabled:bg-zinc-50 disabled:opacity-60"
            placeholder="ex: FOISORUL A SRL"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="vat_number" className="text-xs font-medium text-zinc-700">
            CUI / Cod fiscal
          </label>
          <input
            id="vat_number"
            type="text"
            disabled={!canEdit || pending}
            value={vatNumber}
            onChange={(e) => setVatNumber(e.target.value)}
            maxLength={20}
            pattern="^(RO)?\d{2,10}$"
            className="w-full rounded-md border border-zinc-300 px-3 py-2 font-mono text-sm focus:border-zinc-900 focus:outline-none disabled:bg-zinc-50 disabled:opacity-60"
            placeholder="ex: RO12345678"
          />
          <p className="text-xs text-zinc-500">
            Opțional pentru cerere, obligatoriu pentru activare. Format:
            cifre, cu sau fără prefix RO.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={!canEdit || pending || !businessName.trim()}
            className="rounded-md bg-purple-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-700 disabled:opacity-50"
          >
            {pending ? 'Se trimite…' : 'Trimite cererea'}
          </button>
          {latestRequest?.status === 'PENDING' && (
            <span className="text-xs text-zinc-500">
              Aveți deja o cerere în așteptare. Trimiterea creează una nouă.
            </span>
          )}
        </div>

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
      </form>
    </section>
  );
}

function RequestStatusBanner({ request }: { request: RequestRow }) {
  const config = {
    PENDING: {
      label: 'În așteptare',
      tone: 'bg-amber-50 border-amber-200 text-amber-900',
      description:
        'Cererea este în curs de procesare de echipa HIR. Vă contactăm la finalizare.',
    },
    APPROVED: {
      label: 'Aprobată',
      tone: 'bg-emerald-50 border-emerald-200 text-emerald-900',
      description:
        'Cererea a fost aprobată. Stripe este activ pe storefront-ul dumneavoastră.',
    },
    REJECTED: {
      label: 'Respinsă',
      tone: 'bg-rose-50 border-rose-200 text-rose-900',
      description:
        'Cererea a fost respinsă. Verificați notele de mai jos și retrimiteți cu datele corectate.',
    },
  }[request.status];

  const submitted = new Date(request.created_at).toLocaleDateString('ro-RO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  return (
    <div className={`mt-3 rounded-md border px-4 py-3 text-sm ${config.tone}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">Cerere existentă: {config.label}</span>
        <span className="text-xs opacity-75">Trimisă pe {submitted}</span>
      </div>
      <p className="mt-1 text-xs">{config.description}</p>
      {request.notes && (
        <p className="mt-2 text-xs">
          <strong>Note de la echipa HIR:</strong> {request.notes}
        </p>
      )}
    </div>
  );
}
