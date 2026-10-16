'use client';

// Client island for the listing detail page — collects the bid fields and
// dispatches submitOfferAction. Defaults the expires_at to "now + 30 min"
// in the manager's local timezone so the input is pre-filled with a sane
// value (a fleet manager rarely wants their bid to expire instantly).
//
// Server validates every field independently; this UI is purely friction
// reduction.
//
// Stream 3 (AI matching) — when HIR_FEATURE_AI_MATCHING_ENABLED is on at the
// server, we also fetch a "Suggested Price" anchor via suggestBidPriceAction
// and render it as a tooltip next to the price input. The action is cached
// server-side for 5min per listing-fleet pair so re-opening the form is
// cheap. When the flag is off (or the action errors), we simply omit the
// tooltip — the bid form stays fully functional.

import { useEffect, useState, useTransition } from 'react';
import { Gavel, Loader2, Sparkles } from 'lucide-react';
import { submitOfferAction, suggestBidPriceAction } from '../../actions';
import { buttonClass } from '@/app/_marketplace-ui';

const FIELD_CLS =
  'rounded-md border border-hir-border bg-hir-bg px-3 py-2 text-sm text-hir-fg transition placeholder:text-hir-muted-fg/70';

type PriceSuggestState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | {
      kind: 'ready';
      suggested: { low_ron: number; mid_ron: number; high_ron: number };
      rationale: string;
      marketSamples: number;
    }
  | { kind: 'error' };

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
  aiMatchingEnabled,
}: {
  listingId: string;
  windowEndIso: string;
  alreadyBid: boolean;
  aiMatchingEnabled: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Suggested-price anchor (Stream 3). Idle when the flag is off; otherwise
  // loads once on mount via the cached server action.
  const [priceSuggest, setPriceSuggest] = useState<PriceSuggestState>({
    kind: aiMatchingEnabled ? 'loading' : 'idle',
  });

  useEffect(() => {
    if (!aiMatchingEnabled) return;
    let cancelled = false;
    (async () => {
      const result = await suggestBidPriceAction(listingId);
      if (cancelled) return;
      if (result.ok) {
        setPriceSuggest({
          kind: 'ready',
          suggested: result.suggested,
          rationale: result.rationale,
          marketSamples: result.market_samples,
        });
      } else {
        // Quiet failure — UX falls back to "no anchor shown".
        setPriceSuggest({ kind: 'error' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [listingId, aiMatchingEnabled]);

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
      className="relative flex flex-col gap-3 overflow-hidden rounded-2xl border border-hir-border bg-hir-surface p-4"
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-violet-600 to-violet-400"
      />
      <div className="flex items-center gap-2">
        <Gavel className="h-4 w-4 text-violet-300" strokeWidth={1.75} aria-hidden />
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
        <span className="flex items-center gap-2">
          <span>Preț ofertat (RON)</span>
          {aiMatchingEnabled ? <PriceSuggestTooltip state={priceSuggest} /> : null}
        </span>
        <input
          name="offered_price_ron"
          type="number"
          step="0.01"
          min="0"
          required
          placeholder={
            priceSuggest.kind === 'ready'
              ? `ex: ${priceSuggest.suggested.mid_ron}`
              : 'ex: 18.50'
          }
          className={`${FIELD_CLS} tabular-nums`}
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
          className={`${FIELD_CLS} tabular-nums`}
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
          className={FIELD_CLS}
        />
      </label>

      <label className="flex flex-col gap-1 text-xs text-hir-muted-fg">
        <span>Note (opțional)</span>
        <textarea
          name="notes"
          rows={2}
          maxLength={1000}
          placeholder="ex: vehicul izoterm, curier dedicat zonei"
          className={`${FIELD_CLS} resize-none`}
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

      <button type="submit" disabled={pending} className={buttonClass('primary', 'md')}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
        {pending ? 'Se trimite...' : alreadyBid ? 'Suprascrie oferta' : 'Trimite oferta'}
      </button>
    </form>
  );
}

/**
 * Tooltip-style anchor next to the price input that surfaces the
 * ai-marketplace-price-suggest output. Static span + native `title` keeps the
 * DOM small (no popover library) — the manager hovers/long-presses to read
 * the rationale. Hidden entirely while loading / on error so the form looks
 * normal when the AI layer is unavailable.
 */
function PriceSuggestTooltip({ state }: { state: PriceSuggestState }): JSX.Element | null {
  if (state.kind === 'loading') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] text-hir-muted-fg">
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
        sugestie...
      </span>
    );
  }
  if (state.kind !== 'ready') return null;
  const { suggested, rationale, marketSamples } = state;
  const title =
    `Sugerat ${suggested.low_ron}-${suggested.high_ron} RON (mediană ${suggested.mid_ron}). ` +
    (marketSamples > 0
      ? `${marketSamples} livrări similare ultimele 90 zile. `
      : 'Date istorice insuficiente — recomandare orientativă. ') +
    rationale;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-violet-500/15 to-fuchsia-500/15 px-2 py-0.5 text-[10px] font-semibold text-violet-200 ring-1 ring-violet-500/30"
      title={title}
    >
      <Sparkles className="h-3 w-3" aria-hidden />
      AI: {suggested.low_ron}-{suggested.high_ron} RON
    </span>
  );
}
