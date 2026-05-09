'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { getBrowserSupabase } from '@/lib/supabase/browser';
import { updateOrderStatus } from '../dashboard/orders/actions';
import type { OrderStatus } from '../dashboard/orders/status-machine';

export type KdsOrder = {
  id: string;
  status: OrderStatus;
  items: unknown;
  notes: string | null;
  delivery_address_id: string | null;
  created_at: string;
  updated_at: string;
};

type Fulfillment = 'all' | 'delivery' | 'pickup';

type ItemSnapshot = {
  name?: string;
  qty?: number;
  quantity?: number;
  modifiers?: Array<{ name?: string }>;
};

const LEFT_COL: OrderStatus[] = ['PENDING', 'CONFIRMED', 'PREPARING'];
const RIGHT_COL: OrderStatus[] = ['READY', 'DISPATCHED'];

const STATUS_LABEL_RO: Record<OrderStatus, string> = {
  PENDING: 'Nouă',
  CONFIRMED: 'Confirmată',
  PREPARING: 'În pregătire',
  READY: 'Gata',
  DISPATCHED: 'Trimisă',
  IN_DELIVERY: 'În livrare',
  DELIVERED: 'Livrată',
  CANCELLED: 'Anulată',
};

const STALE_MS = 10 * 60 * 1000;
const CHIME_COOLDOWN_MS = 3000;
const AUTO_PRINT_IFRAME_TTL_MS = 5000;
const AUTO_PRINT_LS_KEY_PREFIX = 'kds-auto-print-enabled';
const AUTO_PRINT_PRINTED_SS_KEY_PREFIX = 'kds-auto-print-printed';
// Cap the persisted printed-IDs set so an always-on KDS tab doesn't grow unbounded.
const AUTO_PRINT_PRINTED_MAX = 500;

// Persistent alarm: re-chime every 30s while any PENDING/CONFIRMED order
// remains unacknowledged. Distinct softer single-tone chime so staff can tell
// "this is a reminder, not a new order".
const ALARM_REPEAT_MS = 30 * 1000;
const ALARM_ACK_SS_KEY_PREFIX = 'kds-alarm-acked';
const ALARM_STATUSES_NEEDING_ACK: ReadonlySet<OrderStatus> = new Set(['PENDING', 'CONFIRMED']);

function autoPrintLsKey(tenantId: string): string {
  return `${AUTO_PRINT_LS_KEY_PREFIX}:${tenantId}`;
}

function autoPrintPrintedKey(tenantId: string): string {
  return `${AUTO_PRINT_PRINTED_SS_KEY_PREFIX}:${tenantId}`;
}

function alarmAckKey(tenantId: string): string {
  return `${ALARM_ACK_SS_KEY_PREFIX}:${tenantId}`;
}

function shortId(id: string): string {
  return id.slice(0, 8);
}

function fulfillmentOf(o: KdsOrder): 'delivery' | 'pickup' {
  return o.delivery_address_id ? 'delivery' : 'pickup';
}

function itemsOf(o: KdsOrder): ItemSnapshot[] {
  return Array.isArray(o.items) ? (o.items as ItemSnapshot[]) : [];
}

function elapsedLabel(iso: string, nowMs: number): string {
  const sec = Math.max(0, Math.floor((nowMs - new Date(iso).getTime()) / 1000));
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min`;
  const hr = Math.floor(min / 60);
  return `${hr}h ${min % 60}m`;
}

function nextForwardForKds(s: OrderStatus): OrderStatus | null {
  switch (s) {
    case 'PENDING':
      return 'CONFIRMED';
    case 'CONFIRMED':
      return 'PREPARING';
    case 'PREPARING':
      return 'READY';
    case 'READY':
      return 'DISPATCHED';
    default:
      return null;
  }
}

function forwardLabel(from: OrderStatus, fulfillment: 'delivery' | 'pickup'): string {
  switch (from) {
    case 'PENDING':
      return 'Confirmă';
    case 'CONFIRMED':
      return 'Începe pregătirea';
    case 'PREPARING':
      return 'Gata';
    case 'READY':
      return fulfillment === 'pickup' ? 'Predată' : 'Trimisă curierului';
    default:
      return '';
  }
}

export function KdsClient({
  tenantId,
  tenantName,
  initialOrders,
}: {
  tenantId: string;
  tenantName: string;
  initialOrders: KdsOrder[];
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<Fulfillment>('all');
  const [now, setNow] = useState<number>(() => Date.now());

  // Tick the clock so elapsed times + stale indicator update without server round-trips.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 15000);
    return () => window.clearInterval(id);
  }, []);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const lastChimeRef = useRef<number>(0);

  // Persistent-alarm acknowledged set (per-tab session, hydrated from
  // sessionStorage so a tab reload doesn't re-alarm orders the operator
  // already saw moments before — but a fresh tab open re-alarms by design,
  // so an orphan KDS tab doesn't go silent for long-PENDING orders).
  // We use state (not just a ref) so the OrderCard re-renders when the
  // operator clicks "Văzut" and the button collapses to a passive state.
  const [acknowledgedIds, setAcknowledgedIds] = useState<Set<string>>(() => new Set());

  // Auto-print state (additive, opt-in, persisted in localStorage per tenant).
  const [autoPrintEnabled, setAutoPrintEnabled] = useState<boolean>(false);
  const [autoPrintCount, setAutoPrintCount] = useState<number>(0);
  const autoPrintEnabledRef = useRef<boolean>(false);
  // In-memory dedupe set for the current tab session, hydrated from sessionStorage
  // so a tab reload doesn't reprint orders that were already printed in this tab.
  const printedIdsRef = useRef<Set<string>>(new Set());

  // Hydrate the toggle from localStorage and the printed-IDs from sessionStorage
  // on mount; keep refs in sync so the (stable) Realtime handler reads the latest
  // values without resubscribing.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const v = window.localStorage.getItem(autoPrintLsKey(tenantId));
      const enabled = v === '1';
      setAutoPrintEnabled(enabled);
      autoPrintEnabledRef.current = enabled;
    } catch {
      /* localStorage may be unavailable (SSR / privacy mode) */
    }
    try {
      const raw = window.sessionStorage.getItem(autoPrintPrintedKey(tenantId));
      if (raw) {
        const arr: unknown = JSON.parse(raw);
        if (Array.isArray(arr)) {
          printedIdsRef.current = new Set(arr.filter((x): x is string => typeof x === 'string'));
        }
      }
    } catch {
      /* sessionStorage may be unavailable */
    }
  }, [tenantId]);

  useEffect(() => {
    autoPrintEnabledRef.current = autoPrintEnabled;
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(autoPrintLsKey(tenantId), autoPrintEnabled ? '1' : '0');
    } catch {
      /* best-effort */
    }
  }, [autoPrintEnabled, tenantId]);

  // Hydrate acknowledged-order IDs from sessionStorage so a tab reload mid-shift
  // doesn't re-alarm the same orders the operator already ack'd seconds ago.
  // Per-tenant key so tenant-switching doesn't bleed state.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.sessionStorage.getItem(alarmAckKey(tenantId));
      if (raw) {
        const arr: unknown = JSON.parse(raw);
        if (Array.isArray(arr)) {
          setAcknowledgedIds(new Set(arr.filter((x): x is string => typeof x === 'string')));
        }
      }
    } catch {
      /* sessionStorage may be unavailable */
    }
  }, [tenantId]);

  // Persist acknowledged IDs whenever the set changes. Cap at 500 so a
  // long-running tab can't grow unbounded.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      let arr = Array.from(acknowledgedIds);
      if (arr.length > 500) arr = arr.slice(arr.length - 500);
      window.sessionStorage.setItem(alarmAckKey(tenantId), JSON.stringify(arr));
    } catch {
      /* best-effort */
    }
  }, [acknowledgedIds, tenantId]);

  // Persistent alarm: every 30s, scan currently-VISIBLE orders for any
  // PENDING/CONFIRMED that has not been acknowledged. If at least one exists,
  // play a softer single-tone reminder chime. Stops on its own when every
  // such order is either ack'd or has moved to PREPARING+. The 3s cooldown
  // shared with new-order chime keeps a freshly-arrived order from
  // double-chiming with the alarm tick.
  //
  // Codex P2 fix (round 1): respect the active fulfillment filter — when the
  // operator narrows the board to "Livrare" or "Ridicare", an unacknowledged
  // order from the OTHER fulfillment type would still re-chime forever
  // because its card (and the "Văzut" button) is hidden by the filter, so
  // the operator has no way to silence it. The predicate below mirrors the
  // `visible` memo so alarm + UI agree on what counts as "rendered now".
  useEffect(() => {
    const id = window.setInterval(() => {
      const needsAck = initialOrders.some(
        (o) =>
          ALARM_STATUSES_NEEDING_ACK.has(o.status) &&
          !acknowledgedIds.has(o.id) &&
          (filter === 'all' || fulfillmentOf(o) === filter),
      );
      if (!needsAck) return;
      const t = Date.now();
      if (t - lastChimeRef.current < CHIME_COOLDOWN_MS) return;
      lastChimeRef.current = t;
      playReminderChime(audioCtxRef);
    }, ALARM_REPEAT_MS);
    return () => window.clearInterval(id);
  }, [initialOrders, acknowledgedIds, filter]);

  function acknowledgeOrder(orderId: string): void {
    setAcknowledgedIds((prev) => {
      if (prev.has(orderId)) return prev;
      const next = new Set(prev);
      next.add(orderId);
      return next;
    });
  }

  useEffect(() => {
    if (!tenantId) return;
    const supabase = getBrowserSupabase();
    const channel: RealtimeChannel = supabase
      .channel(`kds:${tenantId}:orders`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'restaurant_orders',
          filter: `tenant_id=eq.${tenantId}`,
        },
        (payload) => {
          maybePlayChime();
          // Edge case: an order can be inserted directly in CONFIRMED state
          // (e.g. integration imports). Treat that as an auto-print trigger too.
          // No `old` for INSERT — pass null to skip the transition gate.
          maybeAutoPrintFromPayload(payload.new, null);
          router.refresh();
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'restaurant_orders',
          filter: `tenant_id=eq.${tenantId}`,
        },
        (payload) => {
          maybeAutoPrintFromPayload(payload.new, payload.old);
          router.refresh();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  function maybeAutoPrintFromPayload(row: unknown, oldRow: unknown): void {
    if (!autoPrintEnabledRef.current) return;
    if (!row || typeof row !== 'object') return;
    const r = row as { id?: unknown; status?: unknown };
    const id = typeof r.id === 'string' ? r.id : null;
    const status = typeof r.status === 'string' ? r.status : null;
    if (!id || status !== 'CONFIRMED') return;

    // Transition gate: only fire on actual entry into CONFIRMED. If `oldRow` is
    // present and includes a `status` field (Supabase Realtime ships old fields
    // when REPLICA IDENTITY FULL is set on the table) and that prior status was
    // already CONFIRMED, this is a non-status update (e.g. payment_status flip
    // via markCodOrderPaid) and we must not reprint. When `oldRow` is null (INSERT)
    // or its `status` is missing (default REPLICA IDENTITY), fall through to the
    // dedupe set — that prevents reprints on tab reloads + repeat updates.
    if (oldRow && typeof oldRow === 'object') {
      const o = oldRow as { status?: unknown };
      if (typeof o.status === 'string' && o.status === 'CONFIRMED') return;
    }

    if (printedIdsRef.current.has(id)) return;
    printedIdsRef.current.add(id);
    persistPrintedIds(tenantId, printedIdsRef.current);
    spawnPrintIframe(id);
    setAutoPrintCount((c) => c + 1);
  }

  function maybePlayChime() {
    const t = Date.now();
    if (t - lastChimeRef.current < CHIME_COOLDOWN_MS) return;
    lastChimeRef.current = t;
    playChime(audioCtxRef);
  }

  const visible = useMemo(() => {
    if (filter === 'all') return initialOrders;
    return initialOrders.filter((o) => fulfillmentOf(o) === filter);
  }, [initialOrders, filter]);

  const left = visible.filter((o) => LEFT_COL.includes(o.status));
  const right = visible.filter((o) => RIGHT_COL.includes(o.status));

  return (
    <div className="flex min-h-screen flex-col gap-4 p-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">KDS — {tenantName}</h1>
          <span className="text-sm text-zinc-400">
            {visible.length} comenzi active
          </span>
        </div>
        <div className="flex items-center gap-3">
          <FilterPills value={filter} onChange={setFilter} />
          <AutoPrintToggle
            enabled={autoPrintEnabled}
            count={autoPrintCount}
            onToggle={() => setAutoPrintEnabled((v) => !v)}
          />
          <Link
            href="/dashboard/orders"
            className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
          >
            Ieșire
          </Link>
        </div>
      </header>

      <div className="grid flex-1 grid-cols-1 gap-4 lg:grid-cols-2">
        <Column
          title="ÎN LUCRU"
          orders={left}
          now={now}
          router={router}
          tenantId={tenantId}
          acknowledgedIds={acknowledgedIds}
          onAcknowledge={acknowledgeOrder}
        />
        <Column
          title="GATA"
          orders={right}
          now={now}
          router={router}
          tenantId={tenantId}
          acknowledgedIds={acknowledgedIds}
          onAcknowledge={acknowledgeOrder}
        />
      </div>
    </div>
  );
}

function FilterPills({
  value,
  onChange,
}: {
  value: Fulfillment;
  onChange: (v: Fulfillment) => void;
}) {
  const opts: Array<{ v: Fulfillment; label: string }> = [
    { v: 'all', label: 'Toate' },
    { v: 'delivery', label: 'Livrare' },
    { v: 'pickup', label: 'Ridicare' },
  ];
  return (
    <nav className="flex items-center gap-1 rounded-md bg-zinc-900 p-1 text-sm ring-1 ring-zinc-800">
      {opts.map((o) => {
        const active = o.v === value;
        return (
          <button
            key={o.v}
            type="button"
            onClick={() => onChange(o.v)}
            className={
              'rounded px-3 py-1.5 font-medium transition-colors ' +
              (active
                ? 'bg-zinc-100 text-zinc-900'
                : 'text-zinc-300 hover:text-white')
            }
          >
            {o.label}
          </button>
        );
      })}
    </nav>
  );
}

function AutoPrintToggle({
  enabled,
  count,
  onToggle,
}: {
  enabled: boolean;
  count: number;
  onToggle: () => void;
}) {
  const tooltip = enabled
    ? 'Imprimarea automată este activă. La fiecare comandă confirmată, se deschide automat dialogul de tipărire pe acest dispozitiv.'
    : 'Activați imprimarea automată pentru a tipări bonul de bucătărie automat la fiecare comandă confirmată, fără clic suplimentar.';
  return (
    <button
      type="button"
      onClick={onToggle}
      title={tooltip}
      aria-pressed={enabled}
      aria-label={tooltip}
      className={
        'inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium ring-1 transition-colors ' +
        (enabled
          ? 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/40 hover:bg-emerald-500/20'
          : 'bg-zinc-900 text-zinc-300 ring-zinc-800 hover:bg-zinc-800')
      }
    >
      <PrinterIcon active={enabled} />
      <span>Imprimare automată</span>
      {enabled && (
        <span
          className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-emerald-500/25 px-1.5 text-[10px] font-semibold tabular-nums text-emerald-100"
          aria-label={`${count} bonuri tipărite în această sesiune`}
        >
          {count}
        </span>
      )}
    </button>
  );
}

function PrinterIcon({ active }: { active: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={active ? '' : 'opacity-70'}
    >
      <path d="M6 9V2h12v7" />
      <rect x="6" y="14" width="12" height="8" />
      <path d="M6 18H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2" />
    </svg>
  );
}

function Column({
  title,
  orders,
  now,
  router,
  tenantId,
  acknowledgedIds,
  onAcknowledge,
}: {
  title: string;
  orders: KdsOrder[];
  now: number;
  router: ReturnType<typeof useRouter>;
  tenantId: string;
  acknowledgedIds: Set<string>;
  onAcknowledge: (orderId: string) => void;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
        {title} <span className="text-zinc-600">({orders.length})</span>
      </h2>
      {orders.length === 0 ? (
        <div className="flex h-32 items-center justify-center rounded-lg border border-dashed border-zinc-800 text-sm text-zinc-500">
          Nicio comandă.
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {orders.map((o) => (
            <OrderCard
              key={o.id}
              order={o}
              now={now}
              router={router}
              tenantId={tenantId}
              acknowledged={acknowledgedIds.has(o.id)}
              onAcknowledge={onAcknowledge}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function OrderCard({
  order,
  now,
  router,
  tenantId,
  acknowledged,
  onAcknowledge,
}: {
  order: KdsOrder;
  now: number;
  router: ReturnType<typeof useRouter>;
  tenantId: string;
  acknowledged: boolean;
  onAcknowledge: (orderId: string) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const fulfillment = fulfillmentOf(order);
  const items = itemsOf(order);
  const next = nextForwardForKds(order.status);
  const isStale = now - new Date(order.updated_at).getTime() > STALE_MS;
  const needsAck = ALARM_STATUSES_NEEDING_ACK.has(order.status) && !acknowledged;

  const onAdvance = () => {
    if (!next) return;
    setError(null);
    startTransition(async () => {
      try {
        await updateOrderStatus(order.id, next, tenantId);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Eroare necunoscută.');
      }
    });
  };

  return (
    <li
      className={
        'flex flex-col gap-3 rounded-lg border bg-zinc-900 p-4 shadow-md transition-colors ' +
        (isStale ? 'border-amber-500' : 'border-zinc-800')
      }
    >
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-base text-zinc-400">#{shortId(order.id)}</span>
          <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs uppercase tracking-wide text-zinc-300">
            {fulfillment === 'pickup' ? 'Ridicare' : 'Livrare'}
          </span>
          <span className="text-xs text-zinc-500">{STATUS_LABEL_RO[order.status]}</span>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={
              'text-base font-semibold tabular-nums ' +
              (isStale ? 'text-amber-400' : 'text-zinc-200')
            }
          >
            {elapsedLabel(order.created_at, now)}
          </span>
          <Link
            href={`/kds/print/${order.id}`}
            target="_blank"
            className="text-xs text-zinc-500 underline-offset-2 hover:text-zinc-300 hover:underline"
          >
            Tipărește
          </Link>
        </div>
      </header>

      {items.length > 0 && (
        <ul className="flex flex-col gap-1 text-lg leading-snug">
          {items.map((it, idx) => {
            const qty = Number(it.qty ?? it.quantity ?? 1);
            return (
              <li key={idx} className="flex flex-col">
                <span>
                  <span className="font-semibold text-white">{qty}×</span>{' '}
                  <span className="text-zinc-100">{it.name ?? 'Produs'}</span>
                </span>
                {Array.isArray(it.modifiers) && it.modifiers.length > 0 && (
                  <span className="ml-6 text-sm text-zinc-400">
                    + {it.modifiers.map((m) => m.name).filter(Boolean).join(', ')}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {order.notes && (
        <p className="rounded-md bg-yellow-500/10 px-3 py-2 text-base font-medium text-yellow-300 ring-1 ring-yellow-500/30">
          ⚠ {order.notes}
        </p>
      )}

      <footer className="flex flex-wrap items-center justify-between gap-2">
        {error && <span className="text-xs text-rose-400">{error}</span>}
        {needsAck && (
          <button
            type="button"
            onClick={() => onAcknowledge(order.id)}
            title="Oprește chime-ul de reamintire pentru această comandă (se reia automat dacă schimbi tab-ul / reîncarci pagina)."
            aria-label="Marchează ca văzut — oprește alarma"
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-zinc-700 bg-zinc-800/60 px-3 text-xs font-medium text-zinc-200 transition-colors hover:bg-zinc-800"
          >
            <EyeIcon />
            Văzut
          </button>
        )}
        {next ? (
          <button
            type="button"
            onClick={onAdvance}
            disabled={pending}
            className="ml-auto inline-flex h-12 items-center justify-center rounded-md bg-emerald-500 px-5 text-base font-semibold text-emerald-950 transition-colors hover:bg-emerald-400 disabled:opacity-60"
          >
            {pending ? '...' : forwardLabel(order.status, fulfillment)}
          </button>
        ) : (
          <span className="ml-auto text-xs text-zinc-500">{STATUS_LABEL_RO[order.status]}</span>
        )}
      </footer>
    </li>
  );
}

function persistPrintedIds(tenantId: string, ids: Set<string>): void {
  if (typeof window === 'undefined') return;
  try {
    // Cap to the most recent N entries to avoid unbounded growth in long sessions.
    let arr = Array.from(ids);
    if (arr.length > AUTO_PRINT_PRINTED_MAX) {
      arr = arr.slice(arr.length - AUTO_PRINT_PRINTED_MAX);
      // Sync the in-memory set with the trimmed array so subsequent reads agree.
      ids.clear();
      for (const id of arr) ids.add(id);
    }
    window.sessionStorage.setItem(autoPrintPrintedKey(tenantId), JSON.stringify(arr));
  } catch {
    /* sessionStorage may be unavailable / quota exceeded — best effort */
  }
}

function spawnPrintIframe(orderId: string): void {
  if (typeof document === 'undefined') return;
  try {
    const iframe = document.createElement('iframe');
    iframe.src = `/kds/print/${orderId}`;
    iframe.setAttribute('aria-hidden', 'true');
    iframe.setAttribute('tabindex', '-1');
    // sandbox: same-origin so the embedded route loads, scripts so AutoPrint runs,
    // modals so window.print() can present the system print dialog.
    iframe.setAttribute('sandbox', 'allow-same-origin allow-scripts allow-modals');
    iframe.style.position = 'fixed';
    iframe.style.left = '-9999px';
    iframe.style.top = '-9999px';
    iframe.style.width = '1px';
    iframe.style.height = '1px';
    iframe.style.border = '0';
    iframe.style.opacity = '0';
    iframe.style.pointerEvents = 'none';
    document.body.appendChild(iframe);
    window.setTimeout(() => {
      try {
        iframe.remove();
      } catch {
        /* best-effort */
      }
    }, AUTO_PRINT_IFRAME_TTL_MS);
  } catch {
    /* best-effort — auto-print is a convenience, never block the KDS */
  }
}

function EyeIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

// Softer single-tone reminder, intentionally distinct from the new-order
// 2-tone chime so staff can tell "this is a reminder, not a new order".
function playReminderChime(audioCtxRef: { current: AudioContext | null }) {
  try {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    let ctx = audioCtxRef.current;
    if (!ctx) {
      ctx = new Ctor();
      audioCtxRef.current = ctx;
    }
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(660, now);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.12, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.5);
  } catch {
    /* best-effort */
  }
}

function playChime(audioCtxRef: { current: AudioContext | null }) {
  try {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    let ctx = audioCtxRef.current;
    if (!ctx) {
      ctx = new Ctor();
      audioCtxRef.current = ctx;
    }
    const now = ctx.currentTime;
    const tones = [
      { freq: 880, start: 0, dur: 0.12 },
      { freq: 1320, start: 0.12, dur: 0.18 },
    ];
    for (const t of tones) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(t.freq, now + t.start);
      gain.gain.setValueAtTime(0, now + t.start);
      gain.gain.linearRampToValueAtTime(0.18, now + t.start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + t.start + t.dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + t.start);
      osc.stop(now + t.start + t.dur + 0.02);
    }
  } catch {
    /* best-effort */
  }
}
