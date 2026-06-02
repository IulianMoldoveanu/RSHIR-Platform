// Command Center CC4b — per-city vendor + delivery rollup.
//
// Iulian's "control absolut pe orașe" surface: every RO city with how many
// vendors operate there and how much the shared courier spine moves through it.
// Reads public.v_city_delivery_rollup (one GROUP BY scan, see 20260630_017) and
// surfaces the city_id-NULL bucket separately. Both restaurant and pharma
// orders are now city-stamped (dispatch trigger MC1 + courier-mirror-pharma
// receiver #869/#870), so only legacy pre-stamping orders and city-less tenants
// land in that bucket — not whole verticals.
//
// Drill-down: each city links to /dashboard/admin/tenants?city=<slug> (the
// vendor list already supports slug-based city filtering). Activation: the
// is_active go-live flag is flipped here (per-city + county-capitals bulk).
//
// Internal-only — RLS-bypass via service-role client, gated by the same
// HIR_PLATFORM_ADMIN_EMAILS allow-list as the sibling /tenants + /cities/events.

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isPlatformAdminEmail } from '@/lib/auth/platform-admin';
import { CityActiveToggle, ActivateCapitalsButton } from './_activation-controls';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Orașe — vendori & comenzi',
  robots: 'noindex,nofollow',
};

type CityRollupRow = {
  city_id: string;
  name: string;
  slug: string;
  county: string | null;
  sort_order: number;
  is_active: boolean;
  vendor_count: number;
  orders_total: number;
  orders_30d: number;
  orders_in_progress: number;
};

type Unassigned = {
  vendorsNoCity: number | null;
  ordersNoCity: number | null;
  pharmaOrdersNoCity: number | null;
};

async function fetchUnassigned(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any,
): Promise<Unassigned> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function countNull(table: string, build?: (q: any) => any): Promise<number | null> {
    try {
      let q = sb.from(table).select('*', { count: 'exact', head: true }).is('city_id', null);
      if (build) q = build(q);
      const { count, error } = await q;
      if (error) return null;
      return count ?? 0;
    } catch {
      return null;
    }
  }
  const [vendorsNoCity, ordersNoCity, pharmaOrdersNoCity] = await Promise.all([
    countNull('tenants'),
    countNull('courier_orders'),
    countNull('courier_orders', (q) => q.eq('vertical', 'pharma')),
  ]);
  return { vendorsNoCity, ordersNoCity, pharmaOrdersNoCity };
}

function n(v: number | null | undefined): string {
  return v === null || v === undefined ? '—' : v.toString();
}

export default async function AdminCitiesRollupPage() {
  const supa = await createServerClient();
  const {
    data: { user },
  } = await supa.auth.getUser();
  if (!user?.email) redirect('/login?next=/dashboard/admin/cities');

  if (!isPlatformAdminEmail(user.email)) {
    return (
      <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
        Acces interzis: această pagină este rezervată administratorilor de platformă HIR.
      </div>
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createAdminClient() as any;

  const { data: rollupData, error } = await sb
    .from('v_city_delivery_rollup')
    .select('city_id, name, slug, county, sort_order, is_active, vendor_count, orders_total, orders_30d, orders_in_progress')
    .order('sort_order', { ascending: true });

  if (error) {
    return (
      <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
        Eroare la încărcarea rollup-ului pe orașe: {error.message}
      </div>
    );
  }

  const rows = (rollupData ?? []) as CityRollupRow[];
  const unassigned = await fetchUnassigned(sb);

  const activeCities = rows.filter((r) => r.is_active).length;
  const citiesWithVendors = rows.filter((r) => r.vendor_count > 0).length;
  const totalVendors = rows.reduce((s, r) => s + r.vendor_count, 0);
  const totalOrders30d = rows.reduce((s, r) => s + r.orders_30d, 0);
  const totalInProgress = rows.reduce((s, r) => s + r.orders_in_progress, 0);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Command Center · Vendori &amp; orașe
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
            Orașe — vendori &amp; comenzi
          </h1>
          <p className="max-w-2xl text-sm text-zinc-600">
            Toate orașele în care operează HIR: câți vendori sunt activați pe fiecare oraș și cât
            mișcă bazinul comun de curieri prin el (restaurant + farmacie, ultimele 30 de zile).
            Activează un oraș ca să-l aduci live (vizibil public + poți asigna vendori); apasă pe
            un oraș pentru lista vendorilor.
          </p>
        </div>
        <ActivateCapitalsButton />
      </header>

      {/* Summary strip */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard label="Orașe active" value={`${activeCities}`} hint={`${citiesWithVendors} cu vendori`} />
        <SummaryCard label="Vendori asignați" value={`${totalVendors}`} hint="restaurante pe platformă" />
        <SummaryCard label="Comenzi 30z" value={`${totalOrders30d}`} hint="bazin comun curieri" />
        <SummaryCard label="În curs acum" value={`${totalInProgress}`} tone={totalInProgress > 0 ? 'emerald' : 'zinc'} />
      </div>

      {/* City table */}
      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
              <th className="px-4 py-2.5 font-medium">Oraș</th>
              <th className="px-4 py-2.5 text-right font-medium">Vendori</th>
              <th className="px-4 py-2.5 text-right font-medium">Comenzi 30z</th>
              <th className="px-4 py-2.5 text-right font-medium">În curs</th>
              <th className="px-4 py-2.5 text-right font-medium">Total</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const hasVendors = r.vendor_count > 0;
              return (
                <tr key={r.city_id} className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className={`font-medium ${hasVendors ? 'text-zinc-900' : 'text-zinc-500'}`}>
                        {r.name}
                      </span>
                      {!r.is_active && (
                        <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] uppercase text-zinc-500">
                          inactiv
                        </span>
                      )}
                    </div>
                    {r.county && <div className="text-xs text-zinc-400">{r.county}</div>}
                  </td>
                  <td className={`px-4 py-3 text-right tabular-nums ${hasVendors ? 'font-semibold text-zinc-900' : 'text-zinc-400'}`}>
                    {r.vendor_count}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-zinc-700">{r.orders_30d}</td>
                  <td className="px-4 py-3 text-right">
                    {r.orders_in_progress > 0 ? (
                      <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                        {r.orders_in_progress}
                      </span>
                    ) : (
                      <span className="tabular-nums text-zinc-300">0</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-zinc-500">{r.orders_total}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex flex-col items-end gap-1">
                      <CityActiveToggle cityId={r.city_id} isActive={r.is_active} />
                      <Link
                        href={`/dashboard/admin/tenants?city=${encodeURIComponent(r.slug)}`}
                        className="text-xs font-medium text-violet-600 hover:underline"
                      >
                        Vendori →
                      </Link>
                    </div>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-sm text-zinc-500">
                  Niciun oraș configurat.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Unassigned bucket — honest about what is NOT city-stamped */}
      <section className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
        <h2 className="text-sm font-semibold text-amber-900">Fără oraș asignat</h2>
        <div className="mt-2 grid gap-3 sm:grid-cols-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-amber-700/80">Vendori fără oraș</p>
            <p className="mt-0.5 text-lg font-semibold text-amber-900">{n(unassigned.vendorsNoCity)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-amber-700/80">Comenzi fără oraș</p>
            <p className="mt-0.5 text-lg font-semibold text-amber-900">{n(unassigned.ordersNoCity)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-amber-700/80">— din care farmacie</p>
            <p className="mt-0.5 text-lg font-semibold text-amber-900">{n(unassigned.pharmaOrdersNoCity)}</p>
          </div>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-amber-800/90">
          Comenzile de restaurant primesc orașul automat la dispecerizare (din orașul vendorului),
          iar livrările de farmacie din orașul farmaciei (oglindirea pharma trimite acum orașul).
          Aici rămân doar comenzile vechi, create înainte de etichetarea pe oraș. Vendorii fără
          oraș se asignează din{' '}
          <Link href="/dashboard/admin/tenants" className="font-medium text-amber-900 underline">
            Vendori
          </Link>
          .
        </p>
      </section>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  hint,
  tone = 'zinc',
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'zinc' | 'emerald';
}) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4">
      <p className="text-xs uppercase tracking-wide text-zinc-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${tone === 'emerald' ? 'text-emerald-600' : 'text-zinc-900'}`}>
        {value}
      </p>
      {hint && <p className="mt-0.5 text-xs text-zinc-400">{hint}</p>}
    </div>
  );
}
