'use client';

import dynamic from 'next/dynamic';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

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
  tenant: { name: string; slug: string; phone: string | null; location: { lat: number; lng: number } | null } | null;
  customer: { firstName: string; lastNameInitial: string | null } | null;
  dropoff: { neighborhood: string; city: string } | null;
};

export function TrackClient({ token }: { token: string }) {
  const [client] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={client}>
      <TrackInner token={token} />
    </QueryClientProvider>
  );
}

function TrackInner({ token }: { token: string }) {
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
    return <p className="text-sm text-zinc-500">Se încarcă comanda…</p>;
  }
  if (error || !data?.order) {
    return (
      <div className="rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
        Comanda nu a fost găsită. Verifică linkul sau sună la restaurant.
      </div>
    );
  }

  const order = data.order;
  const pickup = order.tenant?.location ?? fallbackPickup;

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        {order.tenant && <p className="text-xs uppercase tracking-widest text-zinc-400">{order.tenant.name}</p>}
        <h1 className="text-2xl font-semibold tracking-tight">Comanda ta</h1>
        <p className="font-mono text-xs text-zinc-500">#{order.id.slice(0, 8)}</p>
      </header>

      <StatusPill status={order.status} paymentStatus={order.paymentStatus} />

      <section className="rounded-xl border border-zinc-200 bg-white p-4 text-sm">
        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-600">Estimat</p>
        <p className="mt-1 text-zinc-700">
          Va fi disponibil când curierul preia comanda — Sprint 4.
        </p>
      </section>

      <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
        <TrackMap pickup={pickup} dropoff={null} restaurantName={order.tenant?.name ?? 'Restaurant'} />
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-4 text-sm">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-600">Produse</p>
        <ul className="space-y-1">
          {order.items.map((it) => (
            <li key={it.itemId} className="flex justify-between">
              <span>
                {it.quantity}× {it.name}
              </span>
              <span className="font-mono text-zinc-700">{it.lineTotalRon.toFixed(2)} RON</span>
            </li>
          ))}
        </ul>
        <div className="mt-3 space-y-1 border-t border-zinc-200 pt-3 text-xs text-zinc-700">
          <Row label="Subtotal" value={`${order.subtotalRon.toFixed(2)} RON`} />
          <Row label="Taxă livrare" value={`${order.deliveryFeeRon.toFixed(2)} RON`} />
          <Row label="Total" value={`${order.totalRon.toFixed(2)} RON`} bold />
        </div>
      </section>

      {order.customer && order.dropoff && (
        <section className="rounded-xl border border-zinc-200 bg-white p-4 text-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-600">Livrare la</p>
          <p className="mt-1 text-zinc-800">
            {order.customer.firstName}
            {order.customer.lastNameInitial && ` ${order.customer.lastNameInitial}`}
          </p>
          <p className="text-zinc-700">
            {order.dropoff.neighborhood}, {order.dropoff.city}
          </p>
        </section>
      )}

      {order.tenant?.phone && (
        <a
          href={`tel:${order.tenant.phone}`}
          className="block w-full rounded-md bg-purple-700 px-4 py-3 text-center text-sm font-medium text-white shadow-sm hover:bg-purple-800"
        >
          Sună restaurantul ({order.tenant.phone})
        </a>
      )}
    </div>
  );
}

function StatusPill({ status, paymentStatus }: { status: string; paymentStatus: string }) {
  const label = STATUS_LABEL_RO[status] ?? status;
  const tone =
    status === 'CANCELLED'
      ? 'bg-rose-100 text-rose-800'
      : status === 'DELIVERED'
        ? 'bg-emerald-100 text-emerald-800'
        : 'bg-amber-100 text-amber-900';
  return (
    <div className="flex items-center gap-2">
      <span className={`inline-block rounded-full px-3 py-1 text-xs font-semibold ${tone}`}>{label}</span>
      {paymentStatus === 'PAID' && (
        <span className="inline-block rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
          Plătit
        </span>
      )}
    </div>
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

const STATUS_LABEL_RO: Record<string, string> = {
  PENDING: 'În așteptare',
  CONFIRMED: 'Confirmată',
  PREPARING: 'În pregătire',
  READY: 'Gata de livrare',
  DISPATCHED: 'Trimisă curierului',
  IN_DELIVERY: 'În livrare',
  DELIVERED: 'Livrată',
  CANCELLED: 'Anulată',
};
