import { t, type Locale, type TKey } from '@/lib/i18n';

// The order-progress timeline: the canonical list of statuses a customer is
// shown, in order, with the current one pulsing and the finished ones struck
// through.
//
// Extracted 2026-08-03 from `app/track/[token]/TrackClient.tsx` so the
// marketing demo (`/demo-storefront/confirmare`) renders the real thing. The
// demo used to show four invented stages — "Comandă primită / În pregătire /
// Curier în drum / Livrată" — against the product's seven, and showed the same
// four whether the visitor had picked delivery or pickup. A prospect who
// counted the steps in the demo and then counted them in the product would
// have found two different products.
//
// Pure presentation: every caller supplies the status and the timestamps.

const STATUS_KEYS: Record<string, TKey> = {
  PENDING: 'track.status_PENDING',
  CONFIRMED: 'track.status_CONFIRMED',
  PREPARING: 'track.status_PREPARING',
  READY: 'track.status_READY',
  DISPATCHED: 'track.status_DISPATCHED',
  IN_DELIVERY: 'track.status_IN_DELIVERY',
  DELIVERED: 'track.status_DELIVERED',
  PICKED_UP: 'track.status_DELIVERED_pickup',
  NO_SHOW: 'track.status_CANCELLED',
  CANCELLED: 'track.status_CANCELLED',
};

export const DELIVERY_STEPS = ['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'DISPATCHED', 'IN_DELIVERY', 'DELIVERED'] as const;
// PICKED_UP (not DELIVERED) is the real terminal status a PICKUP order
// reaches — restaurant_orders now has a dedicated status for it (2026-07-27)
// instead of overloading DELIVERED for an order with no courier leg.
export const PICKUP_STEPS = ['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'PICKED_UP'] as const;

// Honest fallbacks when the tenant hasn't configured prep time. Pickup gets
// a tighter default (no driving) than delivery. Operators set
// pickup_eta_minutes in admin → Operations & program; we fall through to
// these constants only when nothing is set.
export const DEFAULT_PICKUP_MINUTES = 20;
export const DEFAULT_DELIVERY_MINUTES = 35;

export function OrderTimeline({
  status,
  fulfillment,
  createdAt,
  updatedAt,
  paymentStatus,
  locale,
  targetMinutes,
}: {
  status: string;
  fulfillment: 'DELIVERY' | 'PICKUP';
  createdAt: string;
  updatedAt: string;
  paymentStatus: string;
  locale: Locale;
  targetMinutes: number | null;
}) {
  const steps = fulfillment === 'PICKUP' ? PICKUP_STEPS : DELIVERY_STEPS;
  const cancelled = status === 'CANCELLED' || status === 'NO_SHOW';
  const delivered = status === 'DELIVERED' || status === 'PICKED_UP';
  const currentIdx = (steps as readonly string[]).indexOf(status);

  const totalMinutes =
    targetMinutes && targetMinutes > 0
      ? targetMinutes
      : fulfillment === 'PICKUP'
        ? DEFAULT_PICKUP_MINUTES
        : DEFAULT_DELIVERY_MINUTES;
  const elapsed = Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 60_000));
  const remaining = Math.max(0, totalMinutes - elapsed);

  let etaText: string;
  if (cancelled) {
    etaText = t(locale, 'track.eta_cancelled');
  } else if (delivered) {
    const when = new Date(updatedAt).toLocaleTimeString(locale === 'ro' ? 'ro-RO' : 'en-GB', {
      hour: '2-digit',
      minute: '2-digit',
    });
    etaText = t(locale, 'track.eta_delivered_template', { when });
  } else if (fulfillment === 'PICKUP') {
    etaText = t(locale, 'track.eta_pickup_template', { minutes: String(remaining || 5) });
  } else {
    etaText = t(locale, 'track.eta_template', { minutes: String(remaining || 5) });
  }

  return (
    <section
      className={`rounded-xl border p-4 ${
        cancelled ? 'border-rose-200 bg-rose-50' : 'border-zinc-200 bg-white'
      }`}
    >
      <div className="flex items-baseline justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-600">
          {t(locale, 'track.timeline_title')}
        </p>
        {paymentStatus === 'PAID' && !cancelled && (
          <span className="inline-block rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-800">
            {t(locale, 'track.paid')}
          </span>
        )}
      </div>
      <p className={`mt-1 text-base font-semibold ${cancelled ? 'text-rose-800' : 'text-zinc-900'}`}>
        {etaText}
      </p>

      {!cancelled && (
        <ol className="mt-4 space-y-3">
          {steps.map((s, i) => {
            const completed = i < currentIdx || delivered;
            const current = i === currentIdx && !delivered;
            const isLast = i === steps.length - 1;
            // PICKUP_STEPS' terminal step is PICKED_UP (its own STATUS_KEYS
            // entry already points at the _pickup copy), but READY is shared
            // with DELIVERY_STEPS and needs the _pickup variant only when
            // fulfillment is PICKUP — "Ready for delivery" reads wrong when
            // the customer collects in person.
            const labelKey =
              fulfillment === 'PICKUP' && s === 'READY'
                ? ('track.status_READY_pickup' as TKey)
                : STATUS_KEYS[s];
            return (
              <li key={s} className="relative flex items-start gap-3">
                {!isLast && (
                  <span
                    aria-hidden
                    className={`absolute left-[11px] top-6 h-full w-0.5 ${
                      completed ? 'bg-purple-600' : 'bg-zinc-200'
                    }`}
                  />
                )}
                <span
                  aria-hidden
                  className={`relative z-10 flex h-6 w-6 flex-none items-center justify-center rounded-full border-2 ${
                    completed
                      ? 'border-purple-600 bg-purple-600 text-white'
                      : current
                        ? 'border-purple-600 bg-white'
                        : 'border-zinc-300 bg-white'
                  }`}
                >
                  {completed ? (
                    <svg viewBox="0 0 12 12" className="h-3 w-3 fill-current">
                      <path d="M10.28 3.22a.75.75 0 0 1 0 1.06l-4.5 4.5a.75.75 0 0 1-1.06 0l-2-2a.75.75 0 1 1 1.06-1.06l1.47 1.47 3.97-3.97a.75.75 0 0 1 1.06 0Z" />
                    </svg>
                  ) : current ? (
                    <span className="h-2 w-2 animate-pulse rounded-full bg-purple-600 shadow-[0_0_8px_rgba(147,51,234,0.6)]" />
                  ) : null}
                </span>
                <span
                  className={`pt-0.5 text-sm ${
                    completed
                      ? 'text-zinc-500 line-through decoration-zinc-300'
                      : current
                        ? 'font-semibold text-zinc-900'
                        : 'text-zinc-500'
                  }`}
                >
                  {labelKey ? t(locale, labelKey) : s}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
