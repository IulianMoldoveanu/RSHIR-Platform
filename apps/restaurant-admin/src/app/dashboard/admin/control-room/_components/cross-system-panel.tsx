'use client';

// Wave 4 — Cross-system panel for the Control Room. Renders per-tenant
// telemetry (kitchen queue, courier flow, overdue counts, revenue) and
// the live unresolved alerts list. Auto-refreshes every 30s.

import { useEffect, useState, useTransition } from 'react';
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  Building2,
  Clock,
} from 'lucide-react';

type TenantTelemetry = {
  tenant_id: string;
  tenant_name: string;
  tenant_slug: string;
  kitchen_queue: number;
  in_courier_flow: number;
  dispatched_unpicked_over_5m: number;
  kitchen_overdue_over_15m: number;
  delivered_24h: number;
  revenue_24h_ron: number | string;
  last_order_at: string | null;
};

type OpsAlert = {
  id: string;
  tenant_id: string | null;
  alert_type: string;
  severity: 'INFO' | 'WARN' | 'CRIT';
  message: string;
  created_at: string;
};

type Snapshot = {
  telemetry: TenantTelemetry[];
  alerts: OpsAlert[];
  fetched_at: string;
};

function fmtRon(v: number | string): string {
  const n = typeof v === 'string' ? Number(v) : v;
  return `${n.toFixed(0)} RON`;
}

function fmtRelative(iso: string | null): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'acum';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

export function CrossSystemPanel({ initial }: { initial: Snapshot }) {
  const [snap, setSnap] = useState<Snapshot>(initial);
  const [pending, startTransition] = useTransition();
  const [resolveError, setResolveError] = useState<string | null>(null);

  useEffect(() => {
    const t = setInterval(() => {
      void (async () => {
        try {
          const res = await fetch('/api/admin/control-room/cross-system', {
            cache: 'no-store',
          });
          if (!res.ok) return;
          const data = (await res.json()) as Snapshot;
          setSnap(data);
        } catch {
          /* swallow transient errors — next tick retries */
        }
      })();
    }, 30_000);
    return () => clearInterval(t);
  }, []);

  const resolve = (id: string) => {
    setResolveError(null);
    startTransition(async () => {
      const res = await fetch('/api/admin/control-room/resolve-alert', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        setResolveError(data?.error ?? 'Eroare la marcare.');
        return;
      }
      setSnap((s) => ({ ...s, alerts: s.alerts.filter((a) => a.id !== id) }));
    });
  };

  const sorted = [...snap.telemetry].sort((a, b) => {
    const aHot =
      a.kitchen_overdue_over_15m + a.dispatched_unpicked_over_5m;
    const bHot =
      b.kitchen_overdue_over_15m + b.dispatched_unpicked_over_5m;
    if (aHot !== bHot) return bHot - aHot;
    return b.delivered_24h - a.delivered_24h;
  });

  return (
    <section className="flex flex-col gap-4">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
          <Building2 className="h-4 w-4" /> Telemetrie cross-system
        </h2>
        <span className="text-[10px] uppercase tracking-wider text-zinc-500">
          Refresh auto la 30s · ultimul: {fmtRelative(snap.fetched_at)}
        </span>
      </header>

      {/* Unresolved alerts */}
      <div className="rounded-xl border border-zinc-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
            <Bell className="h-4 w-4 text-amber-600" /> Alerte active
          </h3>
          <span className="text-[10px] uppercase tracking-wider text-zinc-500">
            {snap.alerts.length}
          </span>
        </div>
        {resolveError && (
          <div className="mt-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs text-rose-800">
            {resolveError}
          </div>
        )}
        {snap.alerts.length === 0 ? (
          <p className="mt-3 text-xs text-zinc-500">Nicio alertă activă.</p>
        ) : (
          <ul className="mt-3 divide-y divide-zinc-100">
            {snap.alerts.map((a) => (
              <li
                key={a.id}
                className="flex items-center justify-between gap-3 py-2 text-sm"
              >
                <div className="flex min-w-0 items-start gap-2">
                  <AlertTriangle
                    className={`mt-0.5 h-3.5 w-3.5 flex-none ${
                      a.severity === 'CRIT' ? 'text-rose-600' : 'text-amber-600'
                    }`}
                    aria-hidden
                  />
                  <div className="min-w-0">
                    <div className="truncate font-medium text-zinc-900">
                      {a.message}
                    </div>
                    <div className="font-mono text-[10px] text-zinc-500">
                      {a.alert_type} · {fmtRelative(a.created_at)} în urmă
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => resolve(a.id)}
                  disabled={pending}
                  className="inline-flex flex-none items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
                >
                  <CheckCircle2 className="h-3 w-3" aria-hidden /> Rezolvat
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Tenants table */}
      <div className="rounded-xl border border-zinc-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-zinc-900">Restaurante azi</h3>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-[10px] uppercase tracking-wider text-zinc-500">
                <th className="py-2 pr-3 font-medium">Restaurant</th>
                <th className="py-2 pr-3 text-right font-medium">Bucătărie</th>
                <th className="py-2 pr-3 text-right font-medium">La curier</th>
                <th className="py-2 pr-3 text-right font-medium">Probleme</th>
                <th className="py-2 pr-3 text-right font-medium">Livrate 24h</th>
                <th className="py-2 pr-3 text-right font-medium">Venituri 24h</th>
                <th className="py-2 pr-3 text-right font-medium">Ultima</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((t) => {
                const hot =
                  t.kitchen_overdue_over_15m + t.dispatched_unpicked_over_5m;
                return (
                  <tr
                    key={t.tenant_id}
                    className={`border-b border-zinc-100 last:border-0 ${
                      hot > 0 ? 'bg-amber-50/40' : ''
                    }`}
                  >
                    <td className="py-2 pr-3">
                      <div className="font-medium text-zinc-900">
                        {t.tenant_name}
                      </div>
                      <div className="font-mono text-[10px] text-zinc-500">
                        {t.tenant_slug}
                      </div>
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {t.kitchen_queue}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {t.in_courier_flow}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {hot > 0 ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-900">
                          <AlertTriangle className="h-2.5 w-2.5" />
                          {hot}
                        </span>
                      ) : (
                        <span className="text-zinc-400">—</span>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums text-zinc-700">
                      {t.delivered_24h}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums text-zinc-700">
                      {fmtRon(t.revenue_24h_ron)}
                    </td>
                    <td className="py-2 pr-3 text-right text-[11px] text-zinc-500">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" aria-hidden />
                        {fmtRelative(t.last_order_at)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
