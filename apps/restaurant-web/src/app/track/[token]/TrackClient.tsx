'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Star } from 'lucide-react';
import { formatRon } from '@/lib/format';
import { t, type Locale, type TKey } from '@/lib/i18n';

const TrackMap = dynamic(() => import('./TrackMap').then((m) => m.TrackMap), {
  ssr: false,
  loading: () => <div className="h-64 w-full animate-pulse rounded-md bg-zinc-100" />,
});

type OrderItem = { itemId: string; name: string; priceRon: number; quantity: number; lineTotalRon: number };

type TrackOrder = {
  id: string;
  status: string;
  paymentStatus: string;
  items: OrderItem[];
  subtotalRon: number;
  deliveryFeeRon: number;
  totalRon: number;
  createdAt: string;
  updatedAt: string;
  publicTrackToken: string;
  fulfillment: 'DELIVERY' | 'PICKUP';
  hasReview: boolean;
  tenant: {
    name: string;
    slug: string;
    phone: string | null;
    location: { lat: number; lng: number } | null;
    pickupAddress: string | null;
  } | null;
  customer: { firstName: string; lastNameInitial: string | null } | null;
  dropoff: { neighborhood: string; city: string } | null;
};

export function TrackClient({
  token,
  locale,
  showAccountNudge = false,
}: {
  token: string;
  locale: Locale;
  showAccountNudge?: boolean;
}) {
  const [client] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={client}>
      <TrackInner token={token} locale={locale} showAccountNudge={showAccountNudge} />
    </QueryClientProvider>
  );
}

function TrackInner({
  token,
  locale,
  showAccountNudge,
}: {
  token: string;
  locale: Locale;
  showAccountNudge: boolean;
}) {
  const { data, isLoading, error } = useQuery<{ order: TrackOrder }>({
    queryKey: ['track', token],
    queryFn: async () => {
      const res = await fetch(`/api/track/${token}`, { cache: 'no-store' });
      if (!res.ok) throw new Error('not_found');
      return res.json();
    },
    refetchInterval: 30_000,
  });

  const fallbackPickup = useMemo(
    () => ({ lat: 45.6427, lng: 25.5887 }), // Brașov center fallback
    [],
  );

  if (isLoading) {
    return <p className="text-sm text-zinc-500">{t(locale, 'track.loading')}</p>;
  }
  if (error || !data?.order) {
    return (
      <div className="rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
        {t(locale, 'track.not_found')}
      </div>
    );
  }

  const order = data.order;
  const pickup = order.tenant?.location ?? fallbackPickup;

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        {order.tenant && <p className="text-xs uppercase tracking-widest text-zinc-400">{order.tenant.name}</p>}
        <h1 className="text-2xl font-semibold tracking-tight">{t(locale, 'track.your_order')}</h1>
        <p className="font-mono text-xs text-zinc-500">#{order.id.slice(0, 8)}</p>
      </header>

      <Timeline
        status={order.status}
        fulfillment={order.fulfillment}
        createdAt={order.createdAt}
        updatedAt={order.updatedAt}
        paymentStatus={order.paymentStatus}
        locale={locale}
      />

      {order.tenant?.phone && order.status !== 'DELIVERED' && order.status !== 'CANCELLED' && (
        <a
          href={`tel:${order.tenant.phone}`}
          className="flex h-12 w-full items-center justify-center rounded-full bg-purple-700 px-4 text-base font-semibold text-white shadow-sm transition-colors hover:bg-purple-800"
        >
          {t(locale, 'track.call_restaurant_template', { phone: order.tenant.phone })}
        </a>
      )}

      {order.fulfillment === 'PICKUP' ? (
        <section className="rounded-xl border border-zinc-200 bg-white p-4 text-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-600">
            {t(locale, 'track.pickup_at_label')}
          </p>
          <p className="mt-1 text-zinc-900">
            {order.tenant?.pickupAddress
              ? t(locale, 'track.pickup_at_template', { address: order.tenant.pickupAddress })
              : t(locale, 'track.pickup_at_label')}
          </p>
        </section>
      ) : (
        <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
          <TrackMap pickup={pickup} dropoff={null} restaurantName={order.tenant?.name ?? 'Restaurant'} />
        </section>
      )}

      <section className="rounded-xl border border-zinc-200 bg-white p-4 text-sm">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-600">{t(locale, 'track.products')}</p>
        <ul className="space-y-1">
          {order.items.map((it) => (
            <li key={it.itemId} className="flex justify-between">
              <span>
                {it.quantity}× {it.name}
              </span>
              <span className="font-mono text-zinc-700">{formatRon(it.lineTotalRon, locale)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3 space-y-1 border-t border-zinc-200 pt-3 text-xs text-zinc-700">
          <Row label={t(locale, 'track.subtotal')} value={formatRon(order.subtotalRon, locale)} />
          {order.fulfillment === 'PICKUP' ? (
            <Row label={t(locale, 'track.pickup_at_label')} value={formatRon(0, locale)} />
          ) : (
            <Row label={t(locale, 'track.delivery_fee')} value={formatRon(order.deliveryFeeRon, locale)} />
          )}
          <Row label={t(locale, 'track.total')} value={formatRon(order.totalRon, locale)} bold />
        </div>
      </section>

      {order.fulfillment !== 'PICKUP' && order.customer && order.dropoff && (
        <section className="rounded-xl border border-zinc-200 bg-white p-4 text-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-600">{t(locale, 'track.delivered_to')}</p>
          <p className="mt-1 text-zinc-800">
            {order.customer.firstName}
            {order.customer.lastNameInitial && ` ${order.customer.lastNameInitial}`}
          </p>
          <p className="text-zinc-700">
            {order.dropoff.neighborhood}, {order.dropoff.city}
          </p>
        </section>
      )}

      {order.status === 'PENDING' && order.paymentStatus !== 'PAID' && (
        <CancelWidget token={token} locale={locale} />
      )}

      {order.status === 'DELIVERED' && (
        <ReviewWidget token={token} initialDone={order.hasReview} locale={locale} />
      )}

      {showAccountNudge && order.paymentStatus === 'PAID' && (
        <Link
          href="/account"
          className="block text-center text-sm font-medium text-purple-700 hover:text-purple-900"
        >
          {t(locale, 'track.save_account_nudge')}
        </Link>
      )}
    </div>
  );
}

const STATUS_KEYS: Record<string, TKey> = {
  PENDING: 'track.status_PENDING',
  CONFIRMED: 'track.status_CONFIRMED',
  PREPARING: 'track.status_PREPARING',
  READY: 'track.status_READY',
  DISPATCHED: 'track.status_DISPATCHED',
  IN_DELIVERY: 'track.status_IN_DELIVERY',
  DELIVERED: 'track.status_DELIVERED',
  CANCELLED: 'track.status_CANCELLED',
};

const DELIVERY_STEPS = ['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'IN_DELIVERY', 'DELIVERED'] as const;
const PICKUP_STEPS = ['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'DELIVERED'] as const;

// Honest fallback: ~35 min total target until tenants can configure prep
// time per restaurant. Beats the empty "Vom afișa o estimare în curând".
const DEFAULT_TOTAL_MINUTES = 35;

function Timeline({
  status,
  fulfillment,
  createdAt,
  updatedAt,
  paymentStatus,
  locale,
}: {
  status: string;
  fulfillment: 'DELIVERY' | 'PICKUP';
  createdAt: string;
  updatedAt: string;
  paymentStatus: string;
  locale: Locale;
}) {
  const steps = fulfillment === 'PICKUP' ? PICKUP_STEPS : DELIVERY_STEPS;
  const cancelled = status === 'CANCELLED';
  const delivered = status === 'DELIVERED';
  const currentIdx = (steps as readonly string[]).indexOf(status);

  const elapsed = Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 60_000));
  const remaining = Math.max(0, DEFAULT_TOTAL_MINUTES - elapsed);

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
            const labelKey = STATUS_KEYS[s];
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
                    <span className="h-2 w-2 animate-pulse rounded-full bg-purple-600" />
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

function ReviewWidget({
  token,
  initialDone,
  locale,
}: {
  token: string;
  initialDone: boolean;
  locale: Locale;
}) {
  const [done, setDone] = useState(initialDone);
  const [rating, setRating] = useState<number>(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (done) {
    return (
      <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
        {t(locale, 'track.review_thanks')}
      </section>
    );
  }

  async function submit() {
    if (rating < 1 || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/track/${token}/review`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ rating, comment: comment.trim() || undefined }),
      });
      if (res.ok) {
        setDone(true);
        return;
      }
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setError(
        body.error === 'already_reviewed'
          ? t(locale, 'track.review_error_already')
          : t(locale, 'track.review_error_generic'),
      );
    } catch {
      setError(t(locale, 'track.review_error_generic'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4 text-sm">
      <p className="text-base font-semibold text-zinc-900">{t(locale, 'track.review_prompt')}</p>
      <p className="mt-1 text-xs text-zinc-600">{t(locale, 'track.review_help')}</p>

      <div className="mt-3 flex gap-1" role="radiogroup" aria-label={t(locale, 'track.review_prompt')}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={rating === n}
            aria-label={`${n}`}
            onClick={() => setRating(n)}
            className="flex h-11 w-11 items-center justify-center rounded-md transition-colors hover:bg-zinc-50"
          >
            <Star
              className={`h-7 w-7 transition-colors ${
                n <= rating ? 'fill-amber-400 text-amber-400' : 'text-zinc-300'
              }`}
            />
          </button>
        ))}
      </div>

      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        maxLength={500}
        rows={3}
        placeholder={t(locale, 'track.review_comment_placeholder')}
        className="mt-3 w-full rounded-md border border-zinc-300 p-2 text-sm focus:border-purple-600 focus:outline-none"
      />

      {error && <p className="mt-2 text-xs text-rose-700">{error}</p>}

      <button
        type="button"
        onClick={submit}
        disabled={rating < 1 || submitting}
        className="mt-3 inline-flex h-12 items-center justify-center rounded-full bg-purple-700 px-5 text-base font-semibold text-white shadow-sm transition-colors hover:bg-purple-800 disabled:opacity-50"
      >
        {submitting ? t(locale, 'track.review_submitting') : t(locale, 'track.review_submit')}
      </button>
    </section>
  );
}

function CancelWidget({ token, locale }: { token: string; locale: Locale }) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/track/${token}/cancel`, { method: 'POST' });
      if (res.ok) return;
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? 'cancel_error_generic');
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['track', token] }),
    onError: (e: Error) => {
      setError(
        e.message === 'invalid_state'
          ? t(locale, 'track.cancel_error_state')
          : t(locale, 'track.cancel_error_generic'),
      );
    },
  });

  function onClick() {
    setError(null);
    if (!window.confirm(t(locale, 'track.cancel_confirm'))) return;
    mutation.mutate();
  }

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4 text-sm">
      <p className="text-xs text-zinc-600">{t(locale, 'track.cancel_help')}</p>
      {error && <p className="mt-2 text-xs text-rose-700">{error}</p>}
      <button
        type="button"
        onClick={onClick}
        disabled={mutation.isPending}
        className="mt-3 inline-flex h-10 items-center justify-center rounded-md border border-rose-300 bg-white px-4 text-sm font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50"
      >
        {mutation.isPending
          ? t(locale, 'track.cancel_submitting')
          : t(locale, 'track.cancel_button')}
      </button>
    </section>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? 'border-t border-zinc-200 pt-1 font-semibold' : ''}`}>
      <span>{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}
