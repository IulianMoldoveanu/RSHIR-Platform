// Brand-family consolidated dashboard. Visible when the active tenant
// belongs to a brand with 2+ active locations (parent_brand_id wiring).
//
// Renders rolled-up KPI across all locations + a per-location breakdown.
// Default window: last 30 days. Future enhancement: range picker.

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ChevronRight, Building2, Receipt, TrendingUp, MapPin } from 'lucide-react';
import { getActiveTenant } from '@/lib/tenant';
import { getBrandFamily, getBrandAggregateKpis } from '@/lib/brand';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const WINDOW_DAYS = 30;

function formatRon(amount: number): string {
  return new Intl.NumberFormat('ro-RO', {
    style: 'currency',
    currency: 'RON',
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatInt(n: number): string {
  return new Intl.NumberFormat('ro-RO').format(n);
}

export default async function BrandDashboardPage() {
  const { tenant } = await getActiveTenant();
  const family = await getBrandFamily(tenant.id);

  // Single-location tenants don't need this dashboard.
  if (family.length < 2) {
    redirect('/dashboard');
  }

  const now = new Date();
  const start = new Date(now.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const kpis = await getBrandAggregateKpis(tenant.id, start, now);

  if (!kpis) {
    return (
      <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
        Nu am putut încărca datele brandului.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1 text-xs text-zinc-500" aria-label="Breadcrumb">
        <Link href="/dashboard" className="hover:text-zinc-800">
          Acasă
        </Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="font-medium text-zinc-900">Brand (multi-locație)</span>
      </nav>

      <header className="flex flex-col gap-1">
        <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Consolidat · {WINDOW_DAYS} de zile
        </div>
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
          {kpis.brandRootName} — toate locațiile
        </h1>
        <p className="text-sm text-zinc-600">
          Rollup peste {formatInt(kpis.locationCount)} locații.
          Fereastra: {new Date(kpis.windowStart).toLocaleDateString('ro-RO')} →{' '}
          {new Date(kpis.windowEnd).toLocaleDateString('ro-RO')}.
        </p>
      </header>

      {/* Aggregate KPI cards */}
      <div className="grid gap-3 sm:grid-cols-4">
        <KpiCard
          icon={<Building2 className="h-4 w-4" />}
          label="Locații"
          value={formatInt(kpis.locationCount)}
        />
        <KpiCard
          icon={<Receipt className="h-4 w-4" />}
          label="Comenzi totale"
          value={formatInt(kpis.ordersTotal)}
          sub={`${formatInt(kpis.ordersDelivered)} livrate`}
        />
        <KpiCard
          icon={<TrendingUp className="h-4 w-4" />}
          label="Venituri (livrate)"
          value={formatRon(kpis.revenueRon)}
        />
        <KpiCard
          icon={<MapPin className="h-4 w-4" />}
          label="Valoare medie comandă"
          value={formatRon(kpis.avgOrderValueRon)}
        />
      </div>

      {/* Per-location table */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold text-zinc-900">Defalcat pe locație</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-xs uppercase text-zinc-500">
                <th className="py-2 pr-3 font-medium">Locație</th>
                <th className="py-2 pr-3 font-medium">Oraș</th>
                <th className="py-2 pr-3 text-right font-medium">Comenzi</th>
                <th className="py-2 pr-3 text-right font-medium">Livrate</th>
                <th className="py-2 pr-3 text-right font-medium">Venituri</th>
                <th className="py-2 pr-3 text-right font-medium">AOV</th>
                <th className="py-2 pr-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {kpis.perLocation.map((l) => {
                const isActive = l.tenantId === tenant.id;
                return (
                  <tr
                    key={l.tenantId}
                    className={`border-b border-zinc-100 last:border-0 ${
                      isActive ? 'bg-violet-50/40' : ''
                    }`}
                  >
                    <td className="py-2 pr-3">
                      <div className="font-medium text-zinc-900">{l.name}</div>
                      <div className="font-mono text-[11px] text-zinc-500">{l.slug}</div>
                    </td>
                    <td className="py-2 pr-3 text-xs text-zinc-700">{l.cityName ?? '—'}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-zinc-800">
                      {formatInt(l.ordersTotal)}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums text-zinc-800">
                      {formatInt(l.ordersDelivered)}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums text-zinc-800">
                      {formatRon(l.revenueRon)}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums text-zinc-600">
                      {l.avgOrderValueRon > 0 ? formatRon(l.avgOrderValueRon) : '—'}
                    </td>
                    <td className="py-2 pr-3 text-right text-xs">
                      {isActive ? (
                        <span className="rounded-full bg-violet-100 px-2 py-0.5 text-violet-800">
                          activ
                        </span>
                      ) : (
                        <span className="text-zinc-400">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-zinc-500">
          &bdquo;AOV&rdquo; = Average Order Value pe comenzile livrate. Pentru a comuta între
          locații, folosește selectorul din bara de sus.
        </p>
      </div>
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
      <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
        <span className="text-zinc-400">{icon}</span>
        {label}
      </div>
      <div className="mt-1 text-xl font-semibold text-zinc-900">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-zinc-500">{sub}</div>}
    </div>
  );
}
