'use client';

import { useEffect, useState } from 'react';
import { Bike, Check, ChefHat, CookingPot, PartyPopper, TriangleAlert, XCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import { Skeleton } from '@hir/ui';
import { CourierTrackPanel } from '../../[token]/CourierTrackPanel';
import { ClientCourierChat } from '../../[token]/ClientCourierChat';

type CourierTrack = {
  courier_order_id: string;
  status: string;
  source_type: string;
  created_at: string;
  updated_at: string;
  pickup: { lat: number | null; lng: number | null; address: string | null };
  dropoff: { lat: number | null; lng: number | null };
  customer_first_name: string | null;
  courier: { first_name: string; last_lat: number | null; last_lng: number | null; last_seen_at: string | null } | null;
};

export function ConnectTrackClient({ ctoken }: { ctoken: string }) {
  const [data, setData] = useState<CourierTrack | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/courier-track/${ctoken}`, { cache: 'no-store' });
        if (res.status === 404) {
          if (!cancelled) setNotFound(true);
          return;
        }
        if (!res.ok) return;
        const j = (await res.json()) as CourierTrack;
        if (!cancelled) setData(j);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    const id = setInterval(load, 20_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [ctoken]);

  if (loading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    );
  }

  if (notFound || !data) {
    return (
      <div
        role="alert"
        className="flex items-start gap-3 rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"
      >
        <TriangleAlert className="h-5 w-5 flex-none" aria-hidden />
        <p>Comanda nu a fost găsită. Verifică link-ul primit pe e-mail sau SMS.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <ConnectHero status={data.status} />

      <CourierTrackPanel ctoken={ctoken} />

      {data.status !== 'CANCELLED' && (
        <ClientCourierChat
          ctoken={ctoken}
          courierFirstName={data.courier?.first_name ?? null}
          orderClosed={data.status === 'DELIVERED'}
        />
      )}

      <Timeline status={data.status} />

      <p className="text-center text-[11px] text-zinc-400">
        Livrare HIR Curier · {new Date(data.created_at).toLocaleString('ro-RO', {
          dateStyle: 'short',
          timeStyle: 'short',
        })}
      </p>
    </div>
  );
}

function ConnectHero({ status }: { status: string }) {
  const cfg = (() => {
    if (status === 'DELIVERED') {
      return {
        Icon: PartyPopper,
        title: 'Comanda a ajuns!',
        body: 'Poftă bună!',
        bg: 'bg-emerald-50',
        border: 'border-emerald-200',
        color: 'text-emerald-700',
      };
    }
    if (status === 'CANCELLED') {
      return {
        Icon: XCircle,
        title: 'Comanda a fost anulată',
        body: 'Dacă ai întrebări, contactează restaurantul.',
        bg: 'bg-rose-50',
        border: 'border-rose-200',
        color: 'text-rose-700',
      };
    }
    if (status === 'PICKED_UP' || status === 'IN_TRANSIT') {
      return {
        Icon: Bike,
        title: 'Curierul este pe drum',
        body: 'Vine cu mâncarea ta — fii pregătit/ă să răspunzi.',
        bg: 'bg-purple-50',
        border: 'border-purple-200',
        color: 'text-purple-700',
      };
    }
    if (status === 'ACCEPTED') {
      return {
        Icon: Bike,
        title: 'Un curier a preluat comanda',
        body: 'Vine la restaurant să o ridice.',
        bg: 'bg-purple-50',
        border: 'border-purple-200',
        color: 'text-purple-700',
      };
    }
    if (status === 'OFFERED') {
      return {
        Icon: CookingPot,
        title: 'Căutăm curier',
        body: 'Cea mai apropiată echipă HIR este notificată.',
        bg: 'bg-amber-50',
        border: 'border-amber-200',
        color: 'text-amber-700',
      };
    }
    return {
      Icon: ChefHat,
      title: 'Comanda este în pregătire',
      body: 'Te anunțăm imediat ce pornește la drum.',
      bg: 'bg-zinc-50',
      border: 'border-zinc-200',
      color: 'text-zinc-700',
    };
  })();
  const { Icon } = cfg;
  return (
    <motion.section
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32 }}
      className={`relative overflow-hidden rounded-2xl border ${cfg.border} ${cfg.bg} p-5`}
    >
      <div className="flex items-start gap-4">
        <span className={`flex h-14 w-14 flex-none items-center justify-center rounded-2xl bg-white/70 shadow-sm ${cfg.color}`}>
          <Icon className="h-7 w-7" strokeWidth={2} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-semibold leading-snug tracking-tight text-zinc-900">{cfg.title}</h1>
          <p className="mt-1 text-sm text-zinc-700">{cfg.body}</p>
        </div>
      </div>
    </motion.section>
  );
}

const STEPS = ['CREATED', 'OFFERED', 'ACCEPTED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED'] as const;
const STEP_LABEL: Record<string, string> = {
  CREATED: 'Comanda preluată',
  OFFERED: 'Căutăm curier',
  ACCEPTED: 'Curier alocat',
  PICKED_UP: 'Mâncarea a fost ridicată',
  IN_TRANSIT: 'În drum spre tine',
  DELIVERED: 'Livrat',
};

function Timeline({ status }: { status: string }) {
  if (status === 'CANCELLED') return null;
  const currentIdx = STEPS.indexOf(status as (typeof STEPS)[number]);
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-600">
        Pașii livrării
      </p>
      <ol className="space-y-3">
        {STEPS.map((s, i) => {
          const completed = i < currentIdx || status === 'DELIVERED';
          const current = i === currentIdx && status !== 'DELIVERED';
          const isLast = i === STEPS.length - 1;
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
                {completed ? <Check className="h-3 w-3" /> : current ? (
                  <span className="h-2 w-2 animate-pulse rounded-full bg-purple-600" />
                ) : null}
              </span>
              <span
                className={`pt-0.5 text-sm ${
                  completed
                    ? 'text-zinc-500'
                    : current
                      ? 'font-semibold text-zinc-900'
                      : 'text-zinc-500'
                }`}
              >
                {STEP_LABEL[s]}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
