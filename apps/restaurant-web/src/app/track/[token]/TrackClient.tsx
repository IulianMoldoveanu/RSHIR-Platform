'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Banknote,
  Bell,
  Bike,
  ChefHat,
  CookingPot,
  MessageCircle,
  PartyPopper,
  Star,
  TriangleAlert,
  UtensilsCrossed,
  XCircle,
} from 'lucide-react';
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
import { useTrackBroadcast } from '@/lib/realtime/track-subscription';

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
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery<{ order: TrackOrder }>({
    queryKey: ['track', token],
    queryFn: async () => {
      const res = await fetch(`/api/track/${token}`, { cache: 'no-store' });
      if (!res.ok) throw new Error('not_found');
      return res.json();
    },
    refetchInterval: 30_000,
  });

  // Lane RT-PUSH — real-time status nudge.
  // The Edge Function `track-broadcast` (see supabase/functions/) publishes
  // a `status_change` event to channel `track:<token>` whenever the AFTER
  // UPDATE trigger fires on `restaurant_orders.status`. We use the broadcast
  // ONLY as an "invalidate the React Query cache now" signal — the refetch
  // hits /api/track/:token (the authoritative server-side source) and any
  // browser Notification is fired off the resulting authoritative state, not
  // off the broadcast payload. This means a third party who somehow knew the
  // token could not inject fake notifications: the worst they could do is
  // cause an extra server fetch. The 30s poll above remains as a fallback.
  useTrackBroadcast(token, () => {
    queryClient.invalidateQueries({ queryKey: ['track', token] });
  });

  // Notification side-effect bound to the authoritative server-side status.
  // We fire when the order's status changes between two consecutive query
  // results AND the user has granted Notification permission AND the tab is
  // hidden (a visible page already shows the change in the timeline).
  const lastNotifiedStatusRef = useRef<string | null>(null);
  const orderStatus = data?.order?.status ?? null;
  const orderId = data?.order?.id ?? null;
  useEffect(() => {
    if (!orderStatus || !orderId) return;
    if (lastNotifiedStatusRef.current === null) {
      // First render: prime the ref but do not fire — we only notify on
      // transitions, not on initial page load.
      lastNotifiedStatusRef.current = orderStatus;
      return;
    }
    if (lastNotifiedStatusRef.current === orderStatus) return;
    lastNotifiedStatusRef.current = orderStatus;
    maybeShowBrowserNotification(locale, { order_id: orderId, status: orderStatus });
  }, [orderStatus, orderId, locale]);

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
  const targetMinutes =
    order.fulfillment === 'PICKUP'
      ? (order.tenant?.pickupEtaMinutes ?? null)
      : (order.tenant?.deliveryEtaMinutes ?? null);
  const totalMinutes =
    targetMinutes && targetMinutes > 0
      ? targetMinutes
      : order.fulfillment === 'PICKUP'
        ? DEFAULT_PICKUP_MINUTES
        : DEFAULT_DELIVERY_MINUTES;
  const elapsed = Math.max(0, Math.floor((Date.now() - new Date(order.createdAt).getTime()) / 60_000));
  const remaining = Math.max(0, totalMinutes - elapsed);

  return (
    <div className="space-y-5">
      {/* Brand strip — tenant name + order # in one tight row. */}
      <header className="flex items-baseline justify-between gap-3 border-b border-zinc-200 pb-3">
        <p className="truncate text-sm font-semibold text-zinc-900">{order.tenant?.name ?? t(locale, 'track.your_order')}</p>
        <p className="font-mono text-xs text-zinc-500">
          {t(locale, 'track.order_label_template', { short: order.id.slice(0, 8) })}
        </p>
      </header>

      <Hero order={order} locale={locale} remainingMinutes={remaining} />

      {/* Cancel widget surfaced above timeline per UX audit (was buried below). */}
      {order.status === 'PENDING' && order.paymentStatus !== 'PAID' && (
        <CancelWidget token={token} locale={locale} />
      )}

      <Timeline
        status={order.status}
        fulfillment={order.fulfillment}
        createdAt={order.createdAt}
        updatedAt={order.updatedAt}
        paymentStatus={order.paymentStatus}
        locale={locale}
        targetMinutes={targetMinutes}
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

      {order.status === 'DELIVERED' && order.tenant && (
        <ReorderRail tenantName={order.tenant.name} tenantSlug={order.tenant.slug} locale={locale} />
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

      {/* Lane L PR 2: cross-device "save my info" magic-link request.
          Renders for any PAID order so a customer who ordered on desktop
          can have the same recognition on their phone (and vice-versa). */}
      {order.paymentStatus === 'PAID' && order.status !== 'CANCELLED' && (
        <SaveMyInfoCard locale={locale} />
      )}
    </div>
  );
}

/**
 * 3-state hero (per UX audit 2026-05-06):
 *   PENDING / CONFIRMED → "În pregătire" + chef icon
 *   PREPARING / READY   → "Mâncarea este aproape gata" + steam/utensils icon
 *   DISPATCHED / IN_DELIVERY → "Curierul este pe drum" + bike icon
 *   DELIVERED          → "Bună poftă!" + party icon + reorder hook
 *   CANCELLED          → muted neutral state
 *
 * The hero is the first thing the customer sees on the page. It restates
 * the order's emotional state in one sentence + one large icon, using the
 * same authoritative status from the API. Animated subtly with framer-motion
 * (respects `prefers-reduced-motion`).
 *
 * Fleet confidentiality: copy says "curier HIR" — never "fleet" / "subcontractor".
 */
function Hero({
  order,
  locale,
  remainingMinutes,
}: {
  order: TrackOrder;
  locale: Locale;
  remainingMinutes: number;
}) {
  const s = order.status;
  const isPickup = order.fulfillment === 'PICKUP';

  let titleKey: TKey;
  let bodyKey: TKey;
  let Icon: typeof ChefHat;
  let iconClass: string;
  let bg: string;
  let border: string;
  let showEta = false;

  if (s === 'CANCELLED') {
    titleKey = 'track.hero_cancelled_title';
    bodyKey = 'track.hero_cancelled_body';
    Icon = XCircle;
    iconClass = 'text-rose-600';
    bg = 'bg-rose-50';
    border = 'border-rose-200';
  } else if (s === 'DELIVERED') {
    titleKey = 'track.hero_delivered_title';
    bodyKey = 'track.hero_delivered_body';
    Icon = PartyPopper;
    iconClass = 'text-emerald-600';
    bg = 'bg-emerald-50';
    border = 'border-emerald-200';
  } else if (s === 'IN_DELIVERY') {
    titleKey = 'track.hero_in_delivery_title';
    bodyKey = 'track.hero_in_delivery_body';
    Icon = Bike;
    iconClass = 'text-purple-700';
    bg = 'bg-purple-50';
    border = 'border-purple-200';
    showEta = remainingMinutes > 0;
  } else if (s === 'DISPATCHED') {
    titleKey = 'track.hero_dispatched_title';
    bodyKey = 'track.hero_dispatched_body';
    Icon = Bike;
    iconClass = 'text-purple-700';
    bg = 'bg-purple-50';
    border = 'border-purple-200';
    showEta = remainingMinutes > 0;
  } else if (s === 'READY') {
    titleKey = 'track.hero_ready_title';
    bodyKey = isPickup ? 'track.hero_ready_pickup_body' : 'track.hero_ready_body';
    Icon = UtensilsCrossed;
    iconClass = 'text-amber-600';
    bg = 'bg-amber-50';
    border = 'border-amber-200';
  } else if (s === 'PREPARING') {
    titleKey = 'track.hero_preparing_title';
    bodyKey = 'track.hero_preparing_body';
    Icon = CookingPot;
    iconClass = 'text-amber-600';
    bg = 'bg-amber-50';
    border = 'border-amber-200';
    showEta = remainingMinutes > 0;
  } else if (s === 'CONFIRMED') {
    titleKey = 'track.hero_confirmed_title';
    bodyKey = 'track.hero_confirmed_body';
    Icon = ChefHat;
    iconClass = 'text-purple-700';
    bg = 'bg-purple-50';
    border = 'border-purple-200';
    showEta = remainingMinutes > 0;
  } else {
    // PENDING (default)
    titleKey = 'track.hero_pending_title';
    bodyKey = 'track.hero_pending_body';
    Icon = ChefHat;
    iconClass = 'text-zinc-700';
    bg = 'bg-zinc-50';
    border = 'border-zinc-200';
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
      className={`relative overflow-hidden rounded-2xl border ${border} ${bg} p-5 motion-reduce:transform-none motion-reduce:transition-none`}
    >
      <div className="flex items-start gap-4">
        <motion.div
          aria-hidden
          className={`flex h-14 w-14 flex-none items-center justify-center rounded-2xl bg-white/70 ${iconClass} shadow-sm`}
          animate={
            s === 'CANCELLED' || s === 'DELIVERED'
              ? undefined
              : { scale: [1, 1.06, 1] }
          }
          transition={{
            duration: 2.4,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        >
          <Icon className="h-7 w-7" strokeWidth={2} />
        </motion.div>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-semibold leading-snug tracking-tight text-zinc-900">
            {t(locale, titleKey)}
          </h1>
          <p className="mt-1 text-sm text-zinc-700">{t(locale, bodyKey)}</p>
          {showEta && (
            <p className="mt-2 text-xs font-medium text-zinc-600">
              {t(locale, 'track.hero_eta_in', { minutes: String(remainingMinutes || 5) })}
            </p>
          )}
        </div>
      </div>
    </motion.section>
  );
}

/**
 * Reorder rail (post-DELIVERED).
 *
 * Spec called for "3 popular items" but no popular-items API exists today
 * and the track payload only carries item names (not menu_item_ids), so a
 * one-click cart restore is not safe. We ship the lighter-weight version:
 * a single CTA back to the tenant storefront. Iulian flagged this fallback
 * as acceptable in the lane prompt; a richer rail is tracked for next
 * iteration once a `/api/storefront/popular` endpoint exists.
 */
function ReorderRail({
  tenantName,
  tenantSlug,
  locale,
}: {
  tenantName: string;
  tenantSlug: string;
  locale: Locale;
}) {
  const primaryDomain = process.env.NEXT_PUBLIC_PRIMARY_DOMAIN || 'lvh.me';
  const url = `https://${tenantSlug}.${primaryDomain}`;
  return (
    <section className="rounded-xl border border-purple-200 bg-purple-50/60 p-4">
      <p className="text-base font-semibold text-purple-900">{t(locale, 'track.reorder_title')}</p>
      <p className="mt-1 text-xs text-purple-800/80">
        {t(locale, 'track.reorder_body_template', { tenant: tenantName })}
      </p>
      <a
        href={url}
        className="mt-3 inline-flex h-11 items-center justify-center rounded-full bg-purple-700 px-5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-purple-800"
      >
        {t(locale, 'track.reorder_cta')}
      </a>
    </section>
  );
}

function SaveMyInfoCard({ locale }: { locale: Locale }) {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (state === 'sending') return;
    const trimmed = email.trim();
    if (!trimmed) return;
    setState('sending');
    try {
      const res = await fetch('/api/account/magic-link/request', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: trimmed }),
      });
      // Endpoint always returns 200 unless rate-limited / invalid input;
      // we surface a generic "sent" so we don't leak whether the email
      // matched a customer record.
      setState(res.ok ? 'sent' : 'error');
    } catch {
      setState('error');
    }
  }

  if (state === 'sent') {
    return (
      <section
        role="status"
        className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"
      >
        {t(locale, 'track.save_info_sent')}
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-purple-200 bg-purple-50/60 p-4">
      <p className="text-base font-semibold text-purple-900">
        {t(locale, 'track.save_info_title')}
      </p>
      <p className="mt-1 text-xs text-purple-800/80">{t(locale, 'track.save_info_body')}</p>
      <form onSubmit={submit} className="mt-3 flex flex-col gap-2 sm:flex-row">
        <label className="sr-only" htmlFor="save-info-email">
          {t(locale, 'track.save_info_email_label')}
        </label>
        <input
          id="save-info-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t(locale, 'track.save_info_email_placeholder')}
          required
          className="h-11 flex-1 rounded-md border border-purple-300 bg-white px-3 text-sm shadow-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
        />
        <button
          type="submit"
          disabled={state === 'sending' || !email.trim()}
          className="h-11 rounded-md bg-purple-700 px-4 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {state === 'sending'
            ? t(locale, 'track.save_info_sending')
            : t(locale, 'track.save_info_send')}
        </button>
      </form>
      {state === 'error' && (
        <p className="mt-2 text-xs text-rose-700" role="alert">
          {t(locale, 'track.save_info_error')}
        </p>
      )}
    </section>
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
      <header className="flex items-baseline justify-between gap-3 border-b border-zinc-200 pb-3">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-20" />
      </header>
      {/* Hero skeleton */}
      <section className="rounded-2xl border border-zinc-200 bg-zinc-50 p-5">
        <div className="flex items-start gap-4">
          <Skeleton className="h-14 w-14 flex-none rounded-2xl" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
      </section>
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

// Lane RT-PUSH — fire an in-page browser Notification when the realtime
// channel reports a status change AND the customer previously granted
// permission via PushOptInTile. We only show it when the tab is hidden
// (otherwise the on-screen timeline already conveys the change). No
// payload contains the courier identity beyond the fixed customer-facing
// label "curier HIR" — fleet/subcontractor naming is internal-only.
const NOTIF_BODY_KEYS: Record<string, TKey> = {
  CONFIRMED: 'track.notif_body_CONFIRMED',
  PREPARING: 'track.notif_body_PREPARING',
  READY: 'track.notif_body_READY',
  DISPATCHED: 'track.notif_body_DISPATCHED',
  IN_DELIVERY: 'track.notif_body_IN_DELIVERY',
  DELIVERED: 'track.notif_body_DELIVERED',
  CANCELLED: 'track.notif_body_CANCELLED',
};

const NOTIF_STATUS_KEYS: Record<string, TKey> = {
  CONFIRMED: 'track.status_CONFIRMED',
  PREPARING: 'track.status_PREPARING',
  READY: 'track.status_READY',
  DISPATCHED: 'track.status_DISPATCHED',
  IN_DELIVERY: 'track.status_IN_DELIVERY',
  DELIVERED: 'track.status_DELIVERED',
  CANCELLED: 'track.status_CANCELLED',
};

function maybeShowBrowserNotification(
  locale: Locale,
  args: { order_id: string; status: string },
): void {
  if (typeof Notification === 'undefined') return;
  if (Notification.permission !== 'granted') return;
  // If the tab is visible, the on-screen UI update is enough.
  if (typeof document !== 'undefined' && document.visibilityState === 'visible') return;

  const bodyKey = NOTIF_BODY_KEYS[args.status];
  const statusKey = NOTIF_STATUS_KEYS[args.status];
  if (!bodyKey || !statusKey) return;

  const short = args.order_id.slice(0, 8);
  const status = t(locale, statusKey);
  const title = t(locale, 'track.notif_title_template', { short, status });
  const body = t(locale, bodyKey);
  try {
    // `renotify` is part of the Notification API but missing from the
    // ambient TS DOM lib; cast keeps strict mode happy while preserving
    // the same-tag re-show behaviour on Chrome/Edge.
    new Notification(title, {
      body,
      tag: `hir-track-${args.order_id}`,
      renotify: true,
    } as NotificationOptions & { renotify?: boolean });
  } catch {
    // Some browsers throw on direct `new Notification` from a page (require
    // a SW notification instead). Silent fallback — VAPID server-push handles
    // those clients via the existing notify-customer-status pipeline.
  }
}
