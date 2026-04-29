'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Banknote, Bell, MessageCircle, Star, TriangleAlert } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Skeleton,
} from '@hir/ui';
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
  paymentMethod: 'CARD' | 'COD' | null;
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
    pickupEtaMinutes: number | null;
    deliveryEtaMinutes: number | null;
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
    return <TrackSkeleton />;
  }
  if (error || !data?.order) {
    return (
      <div
        role="alert"
        className="flex items-start gap-3 rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"
      >
        <TriangleAlert className="h-5 w-5 flex-none" aria-hidden />
        <p>{t(locale, 'track.not_found')}</p>
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
        targetMinutes={
          order.fulfillment === 'PICKUP'
            ? (order.tenant?.pickupEtaMinutes ?? null)
            : (order.tenant?.deliveryEtaMinutes ?? null)
        }
      />

      {order.paymentMethod === 'COD' &&
        order.paymentStatus === 'UNPAID' &&
        order.status !== 'CANCELLED' && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 motion-reduce:transition-none"
          >
            <Banknote className="mt-0.5 h-5 w-5 flex-none text-emerald-600" aria-hidden />
            <p>
              {t(locale, 'track.cod_reminder_template', {
                amount: formatRon(order.totalRon, locale),
              })}
            </p>
          </motion.div>
        )}

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

      <PushOptInTile token={token} orderStatus={order.status} />

      {order.status === 'PENDING' && order.paymentStatus !== 'PAID' && (
        <CancelWidget token={token} locale={locale} />
      )}

      {order.status === 'DELIVERED' && (
        <ReviewWidget token={token} initialDone={order.hasReview} locale={locale} />
      )}

      {order.paymentStatus === 'PAID' && order.tenant && order.status !== 'CANCELLED' && (
        <ShareCard tenantName={order.tenant.name} tenantSlug={order.tenant.slug} locale={locale} />
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

// Honest fallbacks when the tenant hasn't configured prep time. Pickup gets
// a tighter default (no driving) than delivery. Operators set
// pickup_eta_minutes in admin → Operations & program; we fall through to
// these constants only when nothing is set.
const DEFAULT_PICKUP_MINUTES = 20;
const DEFAULT_DELIVERY_MINUTES = 35;

function Timeline({
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
  const cancelled = status === 'CANCELLED';
  const delivered = status === 'DELIVERED';
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
  const [open, setOpen] = useState(false);

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/track/${token}/cancel`, { method: 'POST' });
      if (res.ok) return;
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? 'cancel_error_generic');
    },
    onSuccess: () => {
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ['track', token] });
    },
    onError: (e: Error) => {
      setError(
        e.message === 'invalid_state'
          ? t(locale, 'track.cancel_error_state')
          : t(locale, 'track.cancel_error_generic'),
      );
    },
  });

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4 text-sm">
      <p className="text-xs text-zinc-600">{t(locale, 'track.cancel_help')}</p>
      {error && <p className="mt-2 text-xs text-rose-700">{error}</p>}
      <button
        type="button"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
        disabled={mutation.isPending}
        className="mt-3 inline-flex h-10 items-center justify-center rounded-md border border-rose-300 bg-white px-4 text-sm font-medium text-rose-700 transition-colors hover:bg-rose-50 disabled:opacity-50"
      >
        {mutation.isPending
          ? t(locale, 'track.cancel_submitting')
          : t(locale, 'track.cancel_button')}
      </button>

      <Dialog open={open} onOpenChange={(o) => !mutation.isPending && setOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t(locale, 'track.cancel_button')}</DialogTitle>
            <DialogDescription>{t(locale, 'track.cancel_confirm')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={mutation.isPending}
              className="inline-flex h-10 items-center justify-center rounded-md border border-zinc-200 bg-white px-4 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            >
              {t(locale, 'track.cancel_back')}
            </button>
            <button
              type="button"
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending}
              className="inline-flex h-10 items-center justify-center rounded-md bg-rose-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-rose-700 disabled:opacity-50"
            >
              {mutation.isPending
                ? t(locale, 'track.cancel_submitting')
                : t(locale, 'track.cancel_button')}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

const ACTIVE_STATUSES = new Set([
  'PENDING',
  'CONFIRMED',
  'PREPARING',
  'READY',
  'DISPATCHED',
  'IN_DELIVERY',
]);

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '';

function PushOptInTile({ token, orderStatus }: { token: string; orderStatus: string }) {
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('default');
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof Notification === 'undefined') {
      setPermission('unsupported');
      return;
    }
    setPermission(Notification.permission);
    // If already subscribed in a previous page load, don't show the tile again.
    if (typeof localStorage !== 'undefined' && localStorage.getItem(`hir_push_${token}`)) {
      setSubscribed(true);
    }
  }, [token]);

  // Don't render if: order is done, notifications denied/unsupported, or already subscribed.
  if (!ACTIVE_STATUSES.has(orderStatus)) return null;
  if (permission === 'unsupported' || permission === 'denied') return null;
  if (subscribed) return null;
  // Don't render server-side or before permission state is hydrated (avoid flash).
  if (typeof Notification === 'undefined') return null;

  async function handleSubscribe() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== 'granted') {
        setBusy(false);
        return;
      }

      const reg = await navigator.serviceWorker.register('/service-worker.js');
      // Wait for the SW to be ready before calling pushManager.
      await navigator.serviceWorker.ready;

      const existing = await reg.pushManager.getSubscription();
      const sub =
        existing ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC) as any,
        }));

      const subJson = sub.toJSON() as {
        endpoint: string;
        keys: { p256dh: string; auth: string };
      };

      const res = await fetch(`/api/track/${token}/push/subscribe`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ endpoint: subJson.endpoint, keys: subJson.keys }),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? 'subscribe_failed');
      }

      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(`hir_push_${token}`, '1');
      }
      setSubscribed(true);
    } catch (e) {
      setError('Nu am putut activa notificările. Încearcă din nou.');
      console.error('[PushOptInTile]', e);
    } finally {
      setBusy(false);
    }
  }

  if (subscribed) {
    return (
      <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
        Notificările sunt activate. Te anunțăm când comanda e gata.
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4 text-sm">
      <div className="flex items-start gap-3">
        <Bell className="mt-0.5 h-5 w-5 flex-none text-purple-600" aria-hidden />
        <div className="flex-1">
          <p className="font-semibold text-zinc-900">Primește notificare când e gata comanda</p>
          <p className="mt-0.5 text-xs text-zinc-500">
            Îți trimitem o notificare în browser când statusul comenzii se schimbă.
          </p>
          {error && <p className="mt-2 text-xs text-rose-700">{error}</p>}
          <button
            type="button"
            onClick={handleSubscribe}
            disabled={busy}
            className="mt-3 inline-flex h-10 items-center justify-center rounded-full bg-purple-700 px-5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-purple-800 disabled:opacity-50"
          >
            {busy ? 'Se activează…' : 'Activează notificări'}
          </button>
        </div>
      </div>
    </section>
  );
}

/** Convert a base64url VAPID public key to a Uint8Array for pushManager.subscribe. */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
}

function TrackSkeleton() {
  return (
    <div className="space-y-5" aria-busy="true" aria-live="polite">
      <header className="space-y-1">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-7 w-44" />
        <Skeleton className="h-3 w-20" />
      </header>
      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <Skeleton className="mb-2 h-3 w-28" />
        <Skeleton className="h-5 w-48" />
        <ol className="mt-4 space-y-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <li key={i} className="flex items-center gap-3">
              <Skeleton className="h-6 w-6 rounded-full" />
              <Skeleton className="h-3 flex-1 max-w-40" />
            </li>
          ))}
        </ol>
      </section>
      <Skeleton className="h-12 w-full rounded-full" />
      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <Skeleton className="mb-3 h-3 w-20" />
        <div className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      </section>
    </div>
  );
}

function ShareCard({
  tenantName,
  tenantSlug,
  locale,
}: {
  tenantName: string;
  tenantSlug: string;
  locale: Locale;
}) {
  // Conversion B15-lite: WhatsApp deep-link share. RO's dominant viral
  // channel; one-tap from a successful order is the strongest organic
  // acquisition moment we have. Referral codes are not yet wired so the
  // message just points back to the tenant storefront.
  const primaryDomain = process.env.NEXT_PUBLIC_PRIMARY_DOMAIN || 'lvh.me';
  const url = `https://${tenantSlug}.${primaryDomain}`;
  const text = t(locale, 'track.share_message_template', { tenant: tenantName, url });
  const href = `https://wa.me/?text=${encodeURIComponent(text)}`;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex h-11 w-full items-center justify-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 text-sm font-medium text-emerald-800 transition-colors hover:bg-emerald-100"
    >
      <MessageCircle className="h-4 w-4" aria-hidden />
      {t(locale, 'track.share_whatsapp')}
    </a>
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
