'use client';

import type { LiveOrder, CourierOrderStatus } from '../page';

const EVENT_TEMPLATES: Record<
  CourierOrderStatus,
  (o: LiveOrder) => string
> = {
  CREATED:   (o) => `Comanda #${o.id.slice(0, 8)} noua${o.dropoff_line1 ? ` pe ${o.dropoff_line1}` : ''}`,
  OFFERED:   (o) => `Comanda #${o.id.slice(0, 8)} oferita unui curier`,
  ACCEPTED:  (o) => `Comanda #${o.id.slice(0, 8)} acceptata${o.courier_name ? ` de ${o.courier_name}` : ''}`,
  PICKED_UP: (o) =>
    `Comanda #${o.id.slice(0, 8)} ridicata${o.courier_name ? ` de ${o.courier_name}` : ''}`,
  IN_TRANSIT:(o) =>
    `Comanda #${o.id.slice(0, 8)} in livrare${o.courier_name ? ` cu ${o.courier_name}` : ''}${
      o.dropoff_line1 ? ` spre ${o.dropoff_line1}` : ''
    }`,
  DELIVERED: (o) =>
    `Comanda #${o.id.slice(0, 8)} livrata${o.courier_name ? ` de ${o.courier_name}` : ''}${
      o.dropoff_line1 ? ` la ${o.dropoff_line1}` : ''
    }`,
  CANCELLED: (o) => `Comanda #${o.id.slice(0, 8)} anulata`,
};

const STATUS_DOT: Record<CourierOrderStatus, string> = {
  CREATED:   'bg-zinc-400',
  OFFERED:   'bg-zinc-400',
  ACCEPTED:  'bg-blue-500',
  PICKED_UP: 'bg-yellow-500',
  IN_TRANSIT:'bg-orange-500',
  DELIVERED: 'bg-emerald-500',
  CANCELLED: 'bg-rose-500',
};

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const sec = Math.max(0, Math.floor(diffMs / 1000));
  if (sec < 60) return 'acum';
  const min = Math.floor(sec / 60);
  if (min < 60) return `acum ${min} min`;
  return `acum ${Math.floor(min / 60)}h`;
}

type TimelineEvent = {
  id: string;
  orderId: string;
  status: CourierOrderStatus;
  text: string;
  // Use updated_at as the event timestamp proxy.
  at: string;
};

function buildTimeline(orders: LiveOrder[]): TimelineEvent[] {
  // One event per order: use the most recent state update as the event.
  // Sort descending by updated_at so newest activity appears first.
  return [...orders]
    .sort(
      (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
    )
    .slice(0, 50)
    .map((o) => ({
      id: o.id,
      orderId: o.id,
      status: o.status,
      text: EVENT_TEMPLATES[o.status](o),
      at: o.updated_at,
    }));
}

type Props = { orders: LiveOrder[] };

export function ActivityTimeline({ orders }: Props) {
  const events = buildTimeline(orders);

  return (
    <section aria-labelledby="timeline-heading">
      <h2
        id="timeline-heading"
        className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500"
      >
        Activitate recenta
      </h2>
      {events.length === 0 ? (
        <p className="rounded-xl border border-zinc-200 bg-white px-4 py-6 text-center text-sm text-zinc-400">
          Nicio activitate inca.
        </p>
      ) : (
        <ol
          className="flex max-h-72 flex-col gap-0 overflow-y-auto rounded-xl border border-zinc-200 bg-white"
          aria-label="Timeline activitate comenzi"
        >
          {events.map((e) => (
            <li
              key={`${e.id}-${e.at}`}
              className="flex items-start gap-3 border-b border-zinc-100 px-4 py-2.5 last:border-0"
            >
              <span
                aria-hidden
                className={`mt-1.5 h-2 w-2 flex-none rounded-full ${STATUS_DOT[e.status]}`}
              />
              <div className="min-w-0 flex-1">
                <p className="text-xs text-zinc-700">{e.text}</p>
              </div>
              <time
                dateTime={e.at}
                title={new Date(e.at).toLocaleString('ro-RO')}
                className="shrink-0 text-[10px] tabular-nums text-zinc-400"
              >
                {timeAgo(e.at)}
              </time>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
