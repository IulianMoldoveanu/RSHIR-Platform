// HIR Command Center — cross-vertical delivery orders.
//
// The operational heart of the unified platform: every delivery across ALL
// verticals (restaurant + pharma + future) in one list, read from the shared
// `courier_orders` spine. Filterable by vertical + status. Joins fleet name +
// prefix, city, and assigned courier.
//
// GDPR note: this view is intentionally leak-free — it never renders customer
// phone or pharma item names (medication names), even though the shared pool
// currently still carries them (a separate P0 mirror-coarsening fix). We show
// only what an operator needs to orchestrate: vertical, status, fleet, city,
// addresses, fee, courier.

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isPlatformAdminEmail } from '@/lib/auth/platform-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'HIR Command Center — Comenzi',
  robots: 'noindex,nofollow',
};

const IN_PROGRESS = ['CREATED', 'OFFERED', 'ACCEPTED', 'PICKED_UP', 'IN_TRANSIT'];

const STATUS_TONE: Record<string, string> = {
  CREATED: 'bg-slate-700 text-slate-200',
  OFFERED: 'bg-violet-500/20 text-violet-200',
  ACCEPTED: 'bg-blue-500/20 text-blue-200',
  PICKED_UP: 'bg-amber-500/20 text-amber-200',
  IN_TRANSIT: 'bg-amber-500/20 text-amber-200',
  DELIVERED: 'bg-emerald-500/20 text-emerald-200',
  CANCELLED: 'bg-rose-500/20 text-rose-200',
};

type OrderRow = {
  id: string;
  vertical: string | null;
  status: string;
  fleet_id: string | null;
  city_id: string | null;
  pickup_line1: string | null;
  dropoff_line1: string | null;
  delivery_fee_ron: number | null;
  assigned_courier_user_id: string | null;
  created_at: string;
};

type Sb = {
  from: (t: string) => {
    select: (cols: string) => {
      eq: (c: string, v: string) => SelectTail;
      in: (c: string, v: string[]) => SelectTail;
      order: (c: string, o: { ascending: boolean }) => { limit: (n: number) => Promise<{ data: unknown[] | null }> };
    };
  };
};
type SelectTail = {
  order: (c: string, o: { ascending: boolean }) => { limit: (n: number) => Promise<{ data: unknown[] | null }> };
  in: (c: string, v: string[]) => SelectTail;
};

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleString('ro-RO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default async function CommandCenterOrdersPage(props: {
  searchParams: Promise<{ vertical?: string; status?: string; city?: string }>;
}) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) redirect('/login?next=/dashboard/admin/orders');
  if (!isPlatformAdminEmail(user.email)) {
    return (
      <main className="min-h-screen bg-slate-950 p-10 text-slate-100">
        <div className="mx-auto max-w-2xl rounded-md border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          Acces interzis: rezervat administratorilor de platformă HIR.
        </div>
      </main>
    );
  }

  const sp = await props.searchParams;
  const vertical = sp.vertical && ['restaurant', 'pharma'].includes(sp.vertical) ? sp.vertical : null;
  const status = sp.status ?? null;
  const city = sp.city ?? null;

  const admin = createAdminClient();
  const sb = admin as unknown as Sb;

  let q = sb
    .from('courier_orders')
    .select(
      'id, vertical, status, fleet_id, city_id, pickup_line1, dropoff_line1, delivery_fee_ron, assigned_courier_user_id, created_at',
    ) as unknown as SelectTail & {
    eq: (c: string, v: string) => SelectTail;
  };
  if (vertical) q = q.eq('vertical', vertical) as typeof q;
  if (city) q = q.eq('city_id', city) as typeof q;
  if (status === 'in_progress') q = q.in('status', IN_PROGRESS) as typeof q;
  else if (status) q = q.in('status', [status]) as typeof q;

  const { data: rowsData } = await q.order('created_at', { ascending: false }).limit(100);
  const rows = (rowsData ?? []) as OrderRow[];

  // Resolve fleet names/prefixes, city names, courier names in batch.
  const fleetIds = Array.from(new Set(rows.map((r) => r.fleet_id).filter(Boolean) as string[]));
  const cityIds = Array.from(new Set(rows.map((r) => r.city_id).filter(Boolean) as string[]));
  const courierIds = Array.from(
    new Set(rows.map((r) => r.assigned_courier_user_id).filter(Boolean) as string[]),
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sbAny = admin as any;
  async function fetchMap(
    table: string,
    idCol: string,
    cols: string,
    ids: string[],
  ): Promise<Record<string, Record<string, unknown>>> {
    if (ids.length === 0) return {};
    try {
      const { data } = await sbAny.from(table).select(cols).in(idCol, ids);
      const out: Record<string, Record<string, unknown>> = {};
      for (const r of (data ?? []) as Array<Record<string, unknown>>) {
        out[String(r[idCol])] = r;
      }
      return out;
    } catch {
      return {};
    }
  }

  async function loadAllCities(): Promise<{ id: string; name: string }[]> {
    try {
      const { data } = await sbAny
        .from('cities')
        .select('id, name')
        .order('name', { ascending: true });
      return (data ?? []) as { id: string; name: string }[];
    } catch {
      return [];
    }
  }

  const [fleetMap, cityMap, courierMap, allCities] = await Promise.all([
    fetchMap('courier_fleets', 'id', 'id, name, display_prefix', fleetIds),
    fetchMap('cities', 'id', 'id, name', cityIds),
    fetchMap('courier_profiles', 'user_id', 'user_id, full_name', courierIds),
    loadAllCities(),
  ]);

  function courierLabel(r: OrderRow): string {
    if (!r.assigned_courier_user_id) return '—';
    const c = courierMap[r.assigned_courier_user_id];
    const name = (c?.full_name as string | undefined) ?? 'Curier';
    const prefix = r.fleet_id
      ? ((fleetMap[r.fleet_id]?.display_prefix as string | null | undefined) ?? '')
      : '';
    return prefix ? `${prefix} ${name}` : name;
  }

  const VERTICAL_FILTERS = [
    { key: '', label: 'Toate' },
    { key: 'restaurant', label: '🍕 Restaurant' },
    { key: 'pharma', label: '💊 Farmacie' },
  ];
  const STATUS_FILTERS = [
    { key: '', label: 'Toate' },
    { key: 'in_progress', label: 'În curs' },
    { key: 'DELIVERED', label: 'Livrate' },
    { key: 'CANCELLED', label: 'Anulate' },
  ];

  function filterHref(
    nextVertical: string | null,
    nextStatus: string | null,
    nextCity: string | null,
  ): string {
    const p = new URLSearchParams();
    if (nextVertical) p.set('vertical', nextVertical);
    if (nextStatus) p.set('status', nextStatus);
    if (nextCity) p.set('city', nextCity);
    const qs = p.toString();
    return qs ? `/dashboard/admin/orders?${qs}` : '/dashboard/admin/orders';
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800/60 bg-slate-950/80 px-6 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div>
            <h1 className="font-display text-xl font-bold">Comenzi — cross-vertical</h1>
            <p className="text-xs text-slate-500">
              Toate livrările din bazinul unic de curieri (restaurant + farmacie).
            </p>
          </div>
          <Link href="/dashboard/admin/hub" className="text-sm text-slate-400 hover:text-slate-200">
            ← Command Center
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-6 py-6">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-1.5">
            {VERTICAL_FILTERS.map((f) => (
              <Link
                key={f.key || 'all'}
                href={filterHref(f.key || null, status, city)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  (vertical ?? '') === f.key
                    ? 'bg-purple-600 text-white'
                    : 'border border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800'
                }`}
              >
                {f.label}
              </Link>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            {STATUS_FILTERS.map((f) => (
              <Link
                key={f.key || 'all'}
                href={filterHref(vertical, f.key || null, city)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  (status ?? '') === f.key
                    ? 'bg-purple-600 text-white'
                    : 'border border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800'
                }`}
              >
                {f.label}
              </Link>
            ))}
          </div>
          {/* City filter — GET form (no client JS); scales as we add RO cities. */}
          <form method="GET" action="/dashboard/admin/orders" className="flex items-center gap-1.5">
            {vertical && <input type="hidden" name="vertical" value={vertical} />}
            {status && <input type="hidden" name="status" value={status} />}
            <select
              name="city"
              defaultValue={city ?? ''}
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-300"
              aria-label="Filtrează după oraș"
            >
              <option value="">Toate orașele</option>
              {allCities.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-slate-800"
            >
              Filtrează
            </button>
          </form>
          <span className="ml-auto text-xs text-slate-500">{rows.length} comenzi (max 100)</span>
        </div>

        <div className="mt-5 overflow-hidden rounded-2xl border border-slate-800">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-800 bg-slate-900/60">
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2.5">Când</th>
                <th className="px-4 py-2.5">Vertical</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5">Flotă</th>
                <th className="px-4 py-2.5">Oraș</th>
                <th className="px-4 py-2.5">Traseu</th>
                <th className="px-4 py-2.5">Curier</th>
                <th className="px-4 py-2.5 text-right">Taxă</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-500">
                    Nicio comandă pentru filtrele selectate.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-900/40">
                    <td className="whitespace-nowrap px-4 py-2.5 text-xs text-slate-400">
                      {fmtDate(r.created_at)}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="text-xs">
                        {r.vertical === 'pharma' ? '💊 Farmacie' : '🍕 Restaurant'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          STATUS_TONE[r.status] ?? 'bg-slate-700 text-slate-200'
                        }`}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-300">
                      {r.fleet_id ? ((fleetMap[r.fleet_id]?.name as string | undefined) ?? '—') : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-300">
                      {r.city_id ? ((cityMap[r.city_id]?.name as string | undefined) ?? '—') : '—'}
                    </td>
                    <td className="max-w-[260px] px-4 py-2.5 text-xs text-slate-400">
                      <span className="block truncate">{r.pickup_line1 ?? '—'}</span>
                      <span className="block truncate text-slate-500">→ {r.dropoff_line1 ?? '—'}</span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-300">{courierLabel(r)}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right text-xs text-slate-300">
                      {r.delivery_fee_ron != null ? `${Number(r.delivery_fee_ron).toFixed(2)} RON` : '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[11px] text-slate-600">
          Nu afișăm telefon client sau nume de medicamente — date sensibile rămân în afara
          centrului de control.
        </p>
      </section>
    </main>
  );
}
