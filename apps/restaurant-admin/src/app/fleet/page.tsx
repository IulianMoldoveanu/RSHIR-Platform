import Link from 'next/link';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import { lookupCityCenter } from '@/app/dashboard/zones/default-city-centers';
import { loadDispatchSnapshot } from './_dispatch-snapshot';
import { DispatchMap, type CourierPin, type OrderPin } from './_dispatch-map';
import { DispatchAutoRefresh } from './_dispatch-auto-refresh';

export const dynamic = 'force-dynamic';

// /fleet — live dispatch dashboard for the fleet manager.
//
// 2026-06-15 — extended from the old "feature cards landing" to a live
// dispatch surface per Iulian directive: fleet manager must SEE the map +
// active orders + online couriers without clicking into HIR Curier. Cards
// for deeper actions remain below the live block.

type Snapshot = {
  fleet: { id: string; name: string; slug: string; is_active: boolean; primary_city_id: string | null };
  kyf: { kyf_status: 'PENDING' | 'VERIFIED' | 'REJECTED'; cui: string | null; company_name: string | null } | null;
  cityCenter: { lat: number; lng: number; cityName: string };
};

async function loadFleetMeta(): Promise<Snapshot> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const { data: fleet } = await admin
    .from('courier_fleets')
    .select('id, name, slug, is_active, primary_city_id')
    .eq('owner_user_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!fleet) redirect('/fleet-signup');

  const { data: kyf } = await admin
    .from('fleet_kyf')
    .select('kyf_status, cui, company_name')
    .eq('fleet_id', fleet.id)
    .maybeSingle();

  // City center for map default — looked up via the existing helper used by
  // /dashboard/zones. Falls back to Bucharest centroid if no city is set.
  let cityName = 'București';
  if (fleet.primary_city_id) {
    const { data: city } = await admin
      .from('cities')
      .select('name, slug')
      .eq('id', fleet.primary_city_id)
      .maybeSingle();
    if (city?.name) cityName = city.name as string;
  }
  const center = lookupCityCenter(cityName) ?? { name: 'București', lat: 44.4268, lng: 26.1025 };

  return {
    fleet,
    kyf,
    cityCenter: { lat: center.lat, lng: center.lng, cityName: center.name },
  };
}

function formatRon(n: number): string {
  return `${n.toFixed(2)} RON`;
}

function timeAgo(iso: string | null): string {
  if (!iso) return '—';
  const diffMs = Date.now() - new Date(iso).getTime();
  if (diffMs < 0 || !Number.isFinite(diffMs)) return '—';
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return 'acum';
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}z`;
}

export default async function FleetHome() {
  const { fleet, kyf, cityCenter } = await loadFleetMeta();
  const kyfStatus = kyf?.kyf_status ?? 'PENDING';
  const isVerified = kyfStatus === 'VERIFIED';
  const isRejected = kyfStatus === 'REJECTED';

  // Load dispatch snapshot only if KYF verified — unverified fleets don't
  // dispatch yet, so we save a DB round-trip and show the onboarding block.
  const snapshot = isVerified ? await loadDispatchSnapshot(fleet.id as string) : null;

  // Build pin arrays for the map. Filter to couriers/orders that have coords.
  const courierPins: CourierPin[] =
    snapshot?.couriers
      .filter((c) => c.last_lat != null && c.last_lng != null)
      .map((c) => ({
        user_id: c.user_id,
        full_name: c.full_name,
        lat: c.last_lat as number,
        lng: c.last_lng as number,
        online: c.shift_status === 'ONLINE',
        last_seen_at: c.last_seen_at,
      })) ?? [];

  const orderPins: OrderPin[] =
    snapshot?.activeOrders
      .filter((o) => o.dropoff_lat != null && o.dropoff_lng != null)
      .map((o) => ({
        id: o.id,
        lat: o.dropoff_lat as number,
        lng: o.dropoff_lng as number,
        status: o.status,
        customer_first_name: o.customer_first_name,
        unassigned: !o.assigned_courier_user_id,
      })) ?? [];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">Dispecerat — {fleet.name}</h1>
          <p className="mt-1 text-sm text-zinc-600">
            Vezi curierii pe hartă, comenzile active, KPI-urile zilei + săptămânii. Datele se
            reîmprospătează automat la 30s.
          </p>
        </div>
        {isVerified ? <DispatchAutoRefresh /> : null}
      </div>

      {!isVerified ? (
        <section
          className={`rounded-xl border p-5 ${
            isRejected ? 'border-rose-200 bg-rose-50' : 'border-amber-200 bg-amber-50'
          }`}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-zinc-900">
                Verificare KYF necesară pentru a dispecera
              </h2>
              <p className="mt-1 text-sm text-zinc-700">
                {isRejected
                  ? 'Verificarea KYF a fost respinsă. Recontactează administratorul HIR și revizuiește documentele.'
                  : 'Încarcă documentele firmei pentru a putea opera. De regulă sub 24h.'}
              </p>
              <p className="mt-2 text-xs text-zinc-500">
                CUI: {kyf?.cui ?? '—'} · Firma: {kyf?.company_name ?? fleet.name}
              </p>
            </div>
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
                isRejected ? 'bg-rose-600 text-white' : 'bg-amber-600 text-white'
              }`}
            >
              {kyfStatus}
            </span>
          </div>
          <div className="mt-4">
            <Link
              href="/fleet/kyf"
              className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-semibold text-white hover:bg-zinc-800"
            >
              {isRejected ? 'Revizuiește documentele' : 'Încarcă documente KYF'}
            </Link>
          </div>
        </section>
      ) : null}

      {/* LIVE DISPATCH BLOCK — only when verified */}
      {isVerified && snapshot ? (
        <>
          {/* KPI strip */}
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Kpi label="Curieri ONLINE" value={String(snapshot.onlineCount)} tone="emerald" />
            <Kpi
              label="Comenzi active"
              value={String(snapshot.activeOrders.length)}
              hint={snapshot.unassignedCount > 0 ? `${snapshot.unassignedCount} nealocate` : null}
              tone={snapshot.unassignedCount > 0 ? 'amber' : 'zinc'}
            />
            <Kpi label="Livrate azi" value={String(snapshot.deliveredTodayCount)} tone="zinc" />
            <Kpi
              label="Decontare săptămână"
              value={formatRon(snapshot.payoutWeekRon)}
              hint={`${snapshot.deliveredThisWeekCount} livrări`}
              tone="indigo"
            />
          </section>

          {/* Map + active orders side-by-side on lg, stacked on smaller */}
          <section className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-zinc-900">
                  Hartă flotă · {cityCenter.cityName}
                </h2>
                <p className="text-xs text-zinc-500">
                  {courierPins.length} curieri pe hartă · {orderPins.length} comenzi active
                </p>
              </div>
              <DispatchMap
                couriers={courierPins}
                orders={orderPins}
                defaultCenter={{ lat: cityCenter.lat, lng: cityCenter.lng }}
              />
              <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-zinc-600">
                <span className="inline-flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" aria-hidden /> Curier ONLINE
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-full bg-zinc-400" aria-hidden /> Curier OFFLINE
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-sm bg-amber-500" aria-hidden /> Comandă NEALOCATĂ
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-sm bg-indigo-500" aria-hidden /> Comandă alocată
                </span>
              </div>
            </div>

            <div>
              <h2 className="mb-2 text-sm font-semibold text-zinc-900">Comenzi active</h2>
              {snapshot.activeOrders.length === 0 ? (
                <div className="rounded-xl border border-zinc-200 bg-white p-6 text-center text-sm text-zinc-500">
                  Nicio comandă activă acum.
                </div>
              ) : (
                <ul className="space-y-2">
                  {snapshot.activeOrders.slice(0, 8).map((o) => (
                    <li
                      key={o.id}
                      className="rounded-lg border border-zinc-200 bg-white p-3 text-xs"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-zinc-500">#{o.id.slice(0, 6)}</span>
                        <StatusPill status={o.status} unassigned={!o.assigned_courier_user_id} />
                      </div>
                      <p className="mt-1 truncate font-medium text-zinc-900">
                        {o.customer_first_name ?? '—'}
                      </p>
                      <p className="truncate text-zinc-500">
                        {o.dropoff_line1 ?? 'fără adresă'}
                      </p>
                      <p className="mt-1 flex items-center justify-between text-[10px] text-zinc-400">
                        <span>{timeAgo(o.created_at)} de creare</span>
                        {o.delivery_fee_ron ? <span>{o.delivery_fee_ron.toFixed(2)} RON</span> : null}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
              {snapshot.activeOrders.length > 8 ? (
                <p className="mt-2 text-center text-[11px] text-zinc-500">
                  + {snapshot.activeOrders.length - 8} alte comenzi active
                </p>
              ) : null}
              <a
                href="https://courier.hirforyou.ro/fleet/orders"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 block text-center text-xs font-medium text-indigo-600 hover:underline"
              >
                Dispatch complet (HIR Curier) ↗
              </a>
            </div>
          </section>

          {/* Recent delivered */}
          {snapshot.recentDelivered.length > 0 ? (
            <section className="rounded-xl border border-zinc-200 bg-white p-4">
              <h3 className="mb-3 text-sm font-semibold text-zinc-900">Ultimele livrări finalizate</h3>
              <ul className="space-y-2 text-sm">
                {snapshot.recentDelivered.map((d) => (
                  <li
                    key={d.id}
                    className="flex items-center justify-between gap-2 border-b border-zinc-100 pb-2 last:border-0 last:pb-0"
                  >
                    <span className="font-medium text-zinc-900">{d.customer_first_name ?? '—'}</span>
                    <span className="text-xs text-zinc-500">
                      {d.delivery_fee_ron ? `${d.delivery_fee_ron.toFixed(2)} RON · ` : ''}
                      {timeAgo(d.delivered_at)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      ) : null}

      {/* Feature cards — deep actions */}
      <section className="grid gap-4 sm:grid-cols-2">
        <FeatureCard
          title="Comenzi & dispatch complet"
          desc="Hartă mare, accept/reasignează comenzi, swipe pickup/livrare în aplicația HIR Curier."
          href="https://courier.hirforyou.ro/fleet/orders"
          external
          locked={!isVerified}
          badge="HIR Curier"
        />
        <FeatureCard
          title="Curierii mei"
          desc="Lista curierilor flotei + status KYC. Nume prefixat cu acronimul firmei."
          href="/fleet/couriers"
          locked={!isVerified}
        />
        <FeatureCard
          title="Plăți"
          desc="Decontări săptămânale către HIR (factură) și către curierii tăi."
          href="https://courier.hirforyou.ro/fleet/payouts"
          external
          locked={!isVerified}
        />
        <FeatureCard
          title="Tarife (curier + vendor)"
          desc="Pickup fix + RON/km. Auto-sync cu HIR Curier."
          href="/fleet/tariffs"
          locked={!isVerified}
        />
        <FeatureCard
          title="Verificare KYF"
          desc="Documente firmă + ANAF sync."
          href="/fleet/kyf"
          locked={false}
        />
        <FeatureCard
          title="Hepi — self improvements"
          desc="Asistent AI cu recomandări personalizate."
          href="/fleet/hepi"
          locked={!isVerified}
          badge="AI"
        />
      </section>
    </div>
  );
}

function Kpi({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string | null;
  tone: 'emerald' | 'amber' | 'indigo' | 'zinc';
}) {
  const ring = {
    emerald: 'border-emerald-200 bg-emerald-50',
    amber: 'border-amber-200 bg-amber-50',
    indigo: 'border-indigo-200 bg-indigo-50',
    zinc: 'border-zinc-200 bg-white',
  }[tone];
  return (
    <div className={`rounded-xl border p-3 ${ring}`}>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-1 text-xl font-semibold text-zinc-900">{value}</p>
      {hint ? <p className="mt-0.5 text-[11px] text-zinc-500">{hint}</p> : null}
    </div>
  );
}

function StatusPill({ status, unassigned }: { status: string; unassigned: boolean }) {
  let cls = 'bg-zinc-100 text-zinc-700';
  if (unassigned) cls = 'bg-amber-100 text-amber-700';
  else if (status === 'PICKED_UP' || status === 'IN_TRANSIT') cls = 'bg-indigo-100 text-indigo-700';
  else if (status === 'ACCEPTED' || status === 'OFFERED') cls = 'bg-blue-100 text-blue-700';
  return (
    <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${cls}`}>
      {unassigned ? 'NEALOCATĂ' : status}
    </span>
  );
}

function FeatureCard({
  title,
  desc,
  href,
  locked,
  badge,
  external,
}: {
  title: string;
  desc: string;
  href: string;
  locked: boolean;
  badge?: string;
  external?: boolean;
}) {
  const content = (
    <div
      className={`rounded-xl border p-4 transition ${
        locked
          ? 'border-zinc-200 bg-zinc-50 opacity-60'
          : 'border-zinc-200 bg-white hover:border-zinc-300 hover:shadow-sm'
      }`}
    >
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-zinc-900">{title}</h4>
        {locked ? (
          <span className="text-[10px] font-semibold uppercase text-amber-700">Locked</span>
        ) : badge ? (
          <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-semibold text-purple-700">
            {badge}
          </span>
        ) : external ? (
          <span aria-hidden className="text-[10px] text-zinc-400">↗</span>
        ) : null}
      </div>
      <p className="mt-1 text-xs text-zinc-600">{desc}</p>
    </div>
  );
  if (locked) return content;
  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {content}
      </a>
    );
  }
  return <Link href={href}>{content}</Link>;
}
