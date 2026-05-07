'use client';

// Per-order admin button — manually re-trigger the bon-fiscal print
// through any active Custom-webhook adapter (Datecs companion, etc.).
// Renders only when the tenant has at least one active Custom provider
// configured (probed server-side and passed via prop).
//
// Click → server action `printFiscalReceipt` → existing
// dispatchOrderEvent pipeline → dispatcher → companion. No direct
// adapter call from the browser.

import { useState, useTransition } from 'react';
import { Printer } from 'lucide-react';
import { printFiscalReceipt } from '../actions';

type Props = {
  orderId: string;
  tenantId: string;
};

export function FiscalReceiptButton({ orderId, tenantId }: Props) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<
    | null
    | { ok: true; tone: 'success' | 'info'; msg: string }
    | { ok: false; msg: string }
  >(null);

  const click = () => {
    setResult(null);
    start(async () => {
      try {
        const r = await printFiscalReceipt(orderId, tenantId);
        if (!r.ok) {
          setResult({ ok: false, msg: r.error });
          return;
        }
        if (r.queued) {
          setResult({
            ok: true,
            tone: 'success',
            msg: 'Bon fiscal trimis la imprimantă. Verificați rola termică.',
          });
          return;
        }
        // ok: true, queued: false — surface the reason in plain RO.
        const reason = r.reason;
        const friendly =
          reason === 'no_custom_provider'
            ? 'Niciun furnizor Custom (companion) configurat. Configurați la Setări → Integrări.'
            : reason === 'status_filtered_out'
              ? 'Statusul curent al comenzii nu este în lista „Trimite la" a webhook-ului.'
              : reason === 'rate_limited'
                ? 'Limita de 100 webhook-uri/oră a fost atinsă. Reîncercați peste o oră.'
                : 'Webhook-ul nu a fost trimis.';
        setResult({ ok: true, tone: 'info', msg: friendly });
      } catch (e) {
        setResult({ ok: false, msg: (e as Error).message });
      }
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={click}
        disabled={pending}
        className="inline-flex h-9 items-center gap-2 rounded-md border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-700 shadow-sm hover:bg-zinc-50 disabled:opacity-50"
        aria-label="Tipărește bon fiscal pe imprimanta companion"
      >
        <Printer className="h-3.5 w-3.5" aria-hidden="true" />
        {pending ? 'Se trimite…' : 'Tipărește bon fiscal'}
      </button>
      {result && (
        <p
          role="status"
          className={
            result.ok
              ? result.tone === 'success'
                ? 'text-xs text-emerald-700'
                : 'text-xs text-zinc-600'
              : 'text-xs text-rose-700'
          }
        >
          {result.msg}
        </p>
      )}
      <p className="text-[11px] text-zinc-500">
        Re-trimite webhook-ul către aplicația companion (ex. Datecs FP-700) — folosiți dacă bonul nu s-a tipărit automat la livrare.
      </p>
    </div>
  );
}
