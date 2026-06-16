'use client';

// Client island for the listing detail page — collects the bid fields and
// dispatches submitOfferAction. Defaults the expires_at to "now + 30 min"
// in the manager's local timezone so the input is pre-filled with a sane
// value (a fleet manager rarely wants their bid to expire instantly).
//
// Server validates every field independently; this UI is purely friction
// reduction.

import { useState, useTransition } from 'react';
import { Gavel, Loader2 } from 'lucide-react';
import { submitOfferAction } from '../../actions';

function defaultExpiresAtLocal(): string {
  // <input type="datetime-local"> wants `YYYY-MM-DDTHH:mm` in *local* time.
  // The action converts to a UTC ISO string before forwarding, so the
  // server side stays UTC throughout — only the form input is local.
  const d = new Date(Date.now() + 30 * 60 * 1000);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function BidForm({
  listingId,
  windowEndIso,
  alreadyBid,
}: {
  listingId: string;
  windowEndIso: string;
  alreadyBid: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Tell the manager the upper bound on expires_at (cannot extend past the
  // listing's delivery window end). The edge fn enforces this too.
  const windowEnd = new Date(windowEndIso);
  const windowEndLabel = Number.isFinite(windowEnd.getTime())
    ? new Intl.DateTimeFormat('ro-RO', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      }).format(windowEnd)
    : null;

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    const form = event.currentTarget;
    const fd = new FormData(form);
    fd.set('listing_id', listingId);
    // datetime-local has no timezone — convert to ISO with the manager's
    // local offset so the server gets an unambiguous instant.
    const localExpires = fd.get('expires_at') as string | null;
    if (localExpires) {
      const asDate = new Date(localExpires);
      if (!Number.isNaN(asDate.getTime())) {
        fd.set('expires_at', asDate.toISOString());
      }
    }
    startTransition(async () => {
      const r = await submitOfferAction(fd);
      if (r.ok) {
        setSuccess('Oferta a fost trimisă. Vendorul va decide curând.');
        form.reset();
      } else {
        setError(r.error);
      }
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-3 rounded-2xl border border-hir-border bg-hir-surface p-4"
    >
      <div className="flex items-center gap-2">
        <Gavel className="h-4 w-4 text-violet-300" aria-hidden />
        <h2 className="text-sm font-semibold text-hir-fg">
          {alreadyBid ? 'Revizuiește oferta' : 'Trimite o ofertă'}
        </h2>
      </div>
      <p className="text-xs text-hir-muted-fg">
        Ofertezi prețul total pe care îl ceri vendorului pentru această livrare.
        Decontarea către flotă se face săptămânal, mai puțin comisionul HIR.
        {alreadyBid
          ? ' Ai o ofertă deja activă — trimiterea o suprascrie (status revine la În așteptare).'
          : ''}
      </p>

      <label className="flex flex-col gap-1 text-xs text-hir-muted-fg">
        <span>Preț ofertat (RON)</span>
        <input
          name="offered_price_ron"
          type="number"
          step="0.01"
          min="0"
          required
          placeholder="ex: 18.50"
          className="rounded-md border border-hir-border bg-hir-bg px-3 py-2 text-sm text-hir-fg"
        />
      </label>

      <label className="flex flex-col gap-1 text-xs text-hir-muted-fg">
        <span>ETA (minute până la livrare)</span>
        <input
          name="eta_minutes"
          type="number"
          min="1"
          max="240"
          required
          placeholder="ex: 45"
          className="rounded-md border border-hir-border bg-hir-bg px-3 py-2 text-sm text-hir-fg"
        />
      </label>

      <label className="flex flex-col gap-1 text-xs text-hir-muted-fg">
        <span>
          Valabilitate ofertă
          {windowEndLabel ? (
            <span className="ml-1 text-hir-muted-fg">
              (max: {windowEndLabel})
            </span>
          ) : null}
        </span>
        <input
          name="expires_at"
          type="datetime-local"
          required
          defaultValue={defaultExpiresAtLocal()}
          className="rounded-md border border-hir-border bg-hir-bg px-3 py-2 text-sm text-hir-fg"
        />
      </label>

      <label className="flex flex-col gap-1 text-xs text-hir-muted-fg">
        <span>Note (opțional)</span>
        <textarea
          name="notes"
          rows={2}
          maxLength={1000}
          placeholder="ex: vehicul izoterm, curier dedicat zonei"
          className="resize-none rounded-md border border-hir-border bg-hir-bg px-3 py-2 text-sm text-hir-fg"
        />
      </label>

      {error ? (
        <p className="rounded-md bg-rose-500/10 px-3 py-2 text-xs text-rose-300" role="alert">
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="rounded-md bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
          {success}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center justify-center gap-2 rounded-md bg-violet-500 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-400 disabled:opacity-60"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
        {pending ? 'Se trimite...' : alreadyBid ? 'Suprascrie oferta' : 'Trimite oferta'}
      </button>
    </form>
  );
}
