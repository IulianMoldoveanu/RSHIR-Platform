// B2B Marketplace — platform-admin oversight & audit console.
//
// Strategy Master Plan Section 5 (B2B Marketplace), Stream 8/9 (admin oversight).
// Cross-tenant view for Iulian: aggregate KPIs, recent listings across ALL
// vendor tenants, recent matches with dispute counts, marketplace audit trail
// from `audit_log` (entries written by the trigger in 20260616_009 §8).
//
// Auth: feature flag HIR_FEATURE_MARKETPLACE_ENABLED gates the whole surface
// via `notFound()`. Then HIR_PLATFORM_ADMIN_EMAILS allow-list gates by email.
// Reads use the service-role admin client (RLS bypass = legit cross-tenant
// aggregation; same pattern as /dashboard/admin/orders + /tenants).
//
// Manual override actions (cancel listing / force-reject offer / flag dispute /
// refund) are intentionally rendered DISABLED with a "wire to settlement
// post-MVP" tooltip per the Stream 8/9 design plan — they appear in the UI so
// operators see the eventual surface, but no destructive action runs from this
// page until Faza 3 wires escrow + settlement.
//
// Anti-regression (CLAUDE.md §5): no new `as any`. Schema drift on the three
// marketplace_* tables is funneled through a single hand-rolled `Sb` typed
// shape (matches the convention in /dashboard/settings/audit/page.tsx). The
// service_role client is never exposed to user input — every query is keyed
// by sanitized search-params or fixed time windows.

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isPlatformAdminEmail } from '@/lib/auth/platform-admin';
import {
  ListingStatusBadge,
  MatchStatusBadge,
  type ListingStatus,
  type MatchStatus,
} from '@/app/marketplace/_components';
import { StatCard, VerticalBadge } from '@/app/marketplace/_components/ui';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'HIR Command Center — B2B Marketplace',
  robots: 'noindex,nofollow',
};

// ────────────────────────────────────────────────────────────
// Types — narrow shapes for service-role reads.
// ────────────────────────────────────────────────────────────

type ListingRow = {
  id: string;
  vendor_tenant_id: string;
  vertical: string;
  city_id: string | null;
  status: ListingStatus;
  delivery_window_start: string;
  delivery_window_end: string;
  created_at: string;
};

type MatchRow = {
  id: string;
  listing_id: string;
  fleet_id: string;
  status: MatchStatus;
  final_price_cents: number;
  hir_fee_cents: number;
  dispute_reason: string | null;
  created_at: string;
  matched_at: string;
};

type AuditRow = {
  id: string;
  tenant_id: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  metadata: Record<string, unknown> | null;
  actor_user_id: string | null;
  created_at: string;
};

type TimeRange = '24h' | '7d' | '30d' | 'all';
type VerticalFilter = '' | 'restaurant' | 'pharmacy' | 'retail' | 'other';
type StatusFilter = '' | ListingStatus;

type Sb = {
  from: (t: string) => {
    select: (cols: string, opts?: { count?: 'exact'; head?: boolean }) => SbBuilder;
  };
};

type SbBuilder = {
  eq: (c: string, v: unknown) => SbBuilder;
  in: (c: string, v: readonly unknown[]) => SbBuilder;
  gte: (c: string, v: string) => SbBuilder;
  lte: (c: string, v: string) => SbBuilder;
  like: (c: string, v: string) => SbBuilder;
  order: (c: string, opts: { ascending: boolean }) => SbBuilder;
  limit: (n: number) => Promise<{ data: unknown[] | null; error: { message: string } | null; count?: number | null }>;
  // Awaitable for COUNT-only queries (no .order/.limit chain needed).
  then: <T>(
    onfulfilled: (
      value: { data: unknown[] | null; error: { message: string } | null; count?: number | null },
    ) => T,
  ) => Promise<T>;
};

// ────────────────────────────────────────────────────────────
// Helpers.
// ────────────────────────────────────────────────────────────

const VALID_VERTICALS: ReadonlyArray<VerticalFilter> = ['', 'restaurant', 'pharmacy', 'retail', 'other'];
const VALID_LISTING_STATUSES: ReadonlyArray<StatusFilter> = [
  '',
  'DRAFT',
  'OPEN',
  'MATCHED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
  'EXPIRED',
  'DISPUTED',
];
const VALID_TIME_RANGES: ReadonlyArray<TimeRange> = ['24h', '7d', '30d', 'all'];

function parseVertical(v: string | undefined): VerticalFilter {
  if (!v) return '';
  return (VALID_VERTICALS as readonly string[]).includes(v) ? (v as VerticalFilter) : '';
}

function parseStatus(v: string | undefined): StatusFilter {
  if (!v) return '';
  return (VALID_LISTING_STATUSES as readonly string[]).includes(v) ? (v as StatusFilter) : '';
}

function parseTimeRange(v: string | undefined): TimeRange {
  if (!v) return '7d';
  return (VALID_TIME_RANGES as readonly string[]).includes(v) ? (v as TimeRange) : '7d';
}

function timeRangeToSinceIso(range: TimeRange): string | null {
  if (range === 'all') return null;
  const hours = range === '24h' ? 24 : range === '7d' ? 24 * 7 : 24 * 30;
  return new Date(Date.now() - hours * 3600 * 1000).toISOString();
}

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '—';
  return d.toLocaleString('ro-RO', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function fmtRonFromCents(cents: number | null | undefined): string {
  if (cents == null || !Number.isFinite(cents)) return '—';
  return `${(cents / 100).toFixed(2)} RON`;
}

function fmtCurrencyRonFromCents(cents: number): string {
  return new Intl.NumberFormat('ro-RO', {
    style: 'currency',
    currency: 'RON',
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function kpiDisplay(value: number | string | null): string {
  return value == null ? '—' : typeof value === 'number' ? String(value) : value;
}

// ────────────────────────────────────────────────────────────
// Page component.
// ────────────────────────────────────────────────────────────

export default async function PlatformAdminMarketplacePage(props: {
  searchParams: Promise<{
    status?: string;
    city?: string;
    vertical?: string;
    range?: string;
  }>;
}): Promise<JSX.Element> {
  if (process.env.HIR_FEATURE_MARKETPLACE_ENABLED !== 'true') notFound();

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) redirect('/login?next=/dashboard/admin/marketplace');
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
  const filterStatus = parseStatus(sp.status);
  const filterCity = sp.city && sp.city.trim() !== '' ? sp.city.trim() : '';
  const filterVertical = parseVertical(sp.vertical);
  const filterRange: TimeRange = parseTimeRange(sp.range);
  const sinceIso = timeRangeToSinceIso(filterRange);

  const sb = createAdminClient() as unknown as Sb;

  // ────────────────────────────────────────────────────────────
  // 1. KPI counts (cross-tenant, RLS-bypass via service_role).
  // ────────────────────────────────────────────────────────────

  async function countOpenListings(): Promise<number | null> {
    try {
      let q = sb
        .from('marketplace_listings')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'OPEN');
      if (filterVertical) q = q.eq('vertical', filterVertical);
      if (filterCity) q = q.eq('city_id', filterCity);
      const { count, error } = await q;
      if (error) return null;
      return count ?? 0;
    } catch {
      return null;
    }
  }

  async function countPendingOffers(): Promise<number | null> {
    try {
      const q = sb
        .from('marketplace_offers')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'PENDING');
      const { count, error } = await q;
      if (error) return null;
      return count ?? 0;
    } catch {
      return null;
    }
  }

  async function countMatchesToday(): Promise<number | null> {
    try {
      // "Today" = wall-clock day floor in Europe/Bucharest. We use UTC-since
      // start-of-day to stay timezone-agnostic in code and let the cron timezone
      // contract (Europe/Bucharest) be enforced operationally.
      const startOfDay = new Date();
      startOfDay.setUTCHours(0, 0, 0, 0);
      const { count, error } = await sb
        .from('marketplace_matches')
        .select('*', { count: 'exact', head: true })
        .gte('matched_at', startOfDay.toISOString());
      if (error) return null;
      return count ?? 0;
    } catch {
      return null;
    }
  }

  async function sumGmvAndFeesThisMonth(): Promise<{
    gmvCents: number;
    feesCents: number;
  } | null> {
    try {
      const monthStart = new Date();
      monthStart.setUTCDate(1);
      monthStart.setUTCHours(0, 0, 0, 0);
      const { data, error } = await sb
        .from('marketplace_matches')
        .select('final_price_cents, hir_fee_cents, status')
        .gte('matched_at', monthStart.toISOString())
        .limit(10_000);
      if (error || !data) return null;
      let gmv = 0;
      let fees = 0;
      for (const r of data as Array<{
        final_price_cents: number | null;
        hir_fee_cents: number | null;
        status: string;
      }>) {
        // Exclude refunded/cancelled from GMV; fees stay tracked on every match
        // row because the 1-RON listing fee was earned on acceptance regardless.
        if (r.status !== 'REFUNDED' && r.status !== 'CANCELLED') {
          gmv += Number(r.final_price_cents) || 0;
        }
        fees += Number(r.hir_fee_cents) || 0;
      }
      return { gmvCents: gmv, feesCents: fees };
    } catch {
      return null;
    }
  }

  async function countDisputesOpen(): Promise<number | null> {
    try {
      const { count, error } = await sb
        .from('marketplace_matches')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'DISPUTED');
      if (error) return null;
      return count ?? 0;
    } catch {
      return null;
    }
  }

  // ────────────────────────────────────────────────────────────
  // 2. Recent listings (cross-tenant) with current filters applied.
  // ────────────────────────────────────────────────────────────

  async function loadRecentListings(): Promise<ListingRow[]> {
    try {
      let q = sb
        .from('marketplace_listings')
        .select(
          'id, vendor_tenant_id, vertical, city_id, status, delivery_window_start, delivery_window_end, created_at',
        );
      if (filterStatus) q = q.eq('status', filterStatus);
      if (filterVertical) q = q.eq('vertical', filterVertical);
      if (filterCity) q = q.eq('city_id', filterCity);
      if (sinceIso) q = q.gte('created_at', sinceIso);
      const { data, error } = await q.order('created_at', { ascending: false }).limit(50);
      if (error || !data) return [];
      return data as ListingRow[];
    } catch {
      return [];
    }
  }

  // ────────────────────────────────────────────────────────────
  // 3. Recent matches.
  // ────────────────────────────────────────────────────────────

  async function loadRecentMatches(): Promise<MatchRow[]> {
    try {
      let q = sb
        .from('marketplace_matches')
        .select(
          'id, listing_id, fleet_id, status, final_price_cents, hir_fee_cents, dispute_reason, created_at, matched_at',
        );
      if (sinceIso) q = q.gte('matched_at', sinceIso);
      const { data, error } = await q.order('matched_at', { ascending: false }).limit(50);
      if (error || !data) return [];
      return data as MatchRow[];
    } catch {
      return [];
    }
  }

  // ────────────────────────────────────────────────────────────
  // 4. Audit trail — every row whose action starts with `marketplace.`.
  //    Written by the SECDEF trigger added in 20260616_009 §8.
  // ────────────────────────────────────────────────────────────

  async function loadMarketplaceAudit(): Promise<AuditRow[]> {
    try {
      let q = sb
        .from('audit_log')
        .select('id, tenant_id, action, entity_type, entity_id, metadata, actor_user_id, created_at')
        .like('action', 'marketplace.%');
      if (sinceIso) q = q.gte('created_at', sinceIso);
      const { data, error } = await q.order('created_at', { ascending: false }).limit(50);
      if (error || !data) return [];
      return data as AuditRow[];
    } catch {
      return [];
    }
  }

  // ────────────────────────────────────────────────────────────
  // 5. Resolve tenant + city + fleet display labels in batch.
  // ────────────────────────────────────────────────────────────

  async function fetchLabels(
    table: string,
    idCol: string,
    nameCol: string,
    ids: string[],
  ): Promise<Record<string, string>> {
    if (ids.length === 0) return {};
    try {
      const { data, error } = await sb
        .from(table)
        .select(`${idCol}, ${nameCol}`)
        .in(idCol, ids)
        .limit(500);
      if (error || !data) return {};
      const out: Record<string, string> = {};
      for (const r of data as Array<Record<string, unknown>>) {
        const id = r[idCol];
        const name = r[nameCol];
        if (typeof id === 'string' && typeof name === 'string') out[id] = name;
      }
      return out;
    } catch {
      return {};
    }
  }

  async function loadAllCities(): Promise<{ id: string; name: string }[]> {
    try {
      const { data, error } = await sb
        .from('cities')
        .select('id, name')
        .order('name', { ascending: true })
        .limit(500);
      if (error || !data) return [];
      return data as { id: string; name: string }[];
    } catch {
      return [];
    }
  }

  const [
    openListings,
    pendingOffers,
    matchesToday,
    monthSums,
    openDisputes,
    listings,
    matches,
    auditRows,
    allCities,
  ] = await Promise.all([
    countOpenListings(),
    countPendingOffers(),
    countMatchesToday(),
    sumGmvAndFeesThisMonth(),
    countDisputesOpen(),
    loadRecentListings(),
    loadRecentMatches(),
    loadMarketplaceAudit(),
    loadAllCities(),
  ]);

  // Match → listing context for city/vertical/vendor labels in the matches table.
  const matchListingIds = Array.from(new Set(matches.map((m) => m.listing_id))).filter(Boolean);
  let matchListingIndex: Record<string, ListingRow> = {};
  if (matchListingIds.length > 0) {
    try {
      const { data: extraListings } = await sb
        .from('marketplace_listings')
        .select(
          'id, vendor_tenant_id, vertical, city_id, status, delivery_window_start, delivery_window_end, created_at',
        )
        .in('id', matchListingIds)
        .limit(200);
      for (const r of (extraListings ?? []) as ListingRow[]) matchListingIndex[r.id] = r;
    } catch {
      matchListingIndex = {};
    }
  }

  // Collect every tenant/city/fleet id touched across listings + matches +
  // audit + match-context lookups so the label resolution is one round-trip
  // each.
  const tenantIds = Array.from(
    new Set<string>(
      [
        ...listings.map((l) => l.vendor_tenant_id),
        ...Object.values(matchListingIndex).map((l) => l.vendor_tenant_id),
        ...auditRows.map((a) => a.tenant_id),
      ].filter((v): v is string => typeof v === 'string' && v.length > 0),
    ),
  );
  const cityIds = Array.from(
    new Set<string>(
      [
        ...listings.map((l) => l.city_id),
        ...Object.values(matchListingIndex).map((l) => l.city_id),
      ].filter((v): v is string => typeof v === 'string' && v.length > 0),
    ),
  );
  const fleetIds = Array.from(new Set(matches.map((m) => m.fleet_id).filter(Boolean)));

  const [tenantLabels, cityLabels, fleetLabels] = await Promise.all([
    fetchLabels('tenants', 'id', 'name', tenantIds),
    fetchLabels('cities', 'id', 'name', cityIds),
    fetchLabels('courier_fleets', 'id', 'name', fleetIds),
  ]);

  // ────────────────────────────────────────────────────────────
  // 6. Filter UI link builder.
  // ────────────────────────────────────────────────────────────

  function filterHref(overrides: {
    status?: StatusFilter;
    city?: string;
    vertical?: VerticalFilter;
    range?: TimeRange;
  }): string {
    const p = new URLSearchParams();
    const nextStatus = overrides.status ?? filterStatus;
    const nextCity = overrides.city ?? filterCity;
    const nextVertical = overrides.vertical ?? filterVertical;
    const nextRange = overrides.range ?? filterRange;
    if (nextStatus) p.set('status', nextStatus);
    if (nextCity) p.set('city', nextCity);
    if (nextVertical) p.set('vertical', nextVertical);
    if (nextRange && nextRange !== '7d') p.set('range', nextRange);
    const qs = p.toString();
    return qs ? `/dashboard/admin/marketplace?${qs}` : '/dashboard/admin/marketplace';
  }

  // ────────────────────────────────────────────────────────────
  // 7. Render.
  // ────────────────────────────────────────────────────────────

  const RANGE_TABS: { key: TimeRange; label: string }[] = [
    { key: '24h', label: '24h' },
    { key: '7d', label: '7 zile' },
    { key: '30d', label: '30 zile' },
    { key: 'all', label: 'Tot' },
  ];
  const VERTICAL_TABS: { key: VerticalFilter; label: string }[] = [
    { key: '', label: 'Toate' },
    { key: 'restaurant', label: 'Restaurant' },
    { key: 'pharmacy', label: 'Farmacie' },
    { key: 'retail', label: 'Retail' },
    { key: 'other', label: 'Alte' },
  ];
  const STATUS_TABS: { key: StatusFilter; label: string }[] = [
    { key: '', label: 'Toate' },
    { key: 'OPEN', label: 'Deschise' },
    { key: 'MATCHED', label: 'Atribuite' },
    { key: 'IN_PROGRESS', label: 'În livrare' },
    { key: 'COMPLETED', label: 'Livrate' },
    { key: 'DISPUTED', label: 'Dispute' },
    { key: 'EXPIRED', label: 'Expirate' },
    { key: 'CANCELLED', label: 'Anulate' },
  ];

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800/60 bg-slate-950/80 px-6 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div>
            <h1 className="font-display text-xl font-bold">B2B Marketplace — Oversight</h1>
            <p className="text-xs text-slate-500">
              Vedere cross-tenant: cereri, oferte, atribuiri, dispute și audit. Read-only;
              acțiunile manuale se cablează la settlement post-MVP.
            </p>
          </div>
          <Link href="/dashboard/admin/hub" className="text-sm text-slate-400 hover:text-slate-200">
            ← Command Center
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-6 py-6">
        {/* ── KPI cards ────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <StatCard label="Cereri deschise" value={kpiDisplay(openListings)} />
          <StatCard label="Oferte în așteptare" value={kpiDisplay(pendingOffers)} />
          <StatCard label="Atribuiri azi" value={kpiDisplay(matchesToday)} />
          <StatCard
            label="GMV luna curentă"
            value={kpiDisplay(monthSums ? fmtCurrencyRonFromCents(monthSums.gmvCents) : null)}
            placeholder
          />
          <StatCard
            label="Comision HIR luna curentă"
            value={kpiDisplay(monthSums ? fmtCurrencyRonFromCents(monthSums.feesCents) : null)}
            placeholder
          />
        </div>
        {openDisputes != null && openDisputes > 0 && (
          <div className="mt-3 rounded-md border border-rose-500/40 bg-rose-500/10 px-4 py-2 text-sm text-rose-200">
            {openDisputes} {openDisputes === 1 ? 'dispută activă' : 'dispute active'} — verifică
            tabelul de atribuiri mai jos.
          </div>
        )}

        {/* ── Filter bar ───────────────────────────────────────── */}
        <div className="mt-6 space-y-3 rounded-2xl border border-slate-800 bg-slate-900/40 px-4 py-3">
          <FilterRow label="Interval">
            {RANGE_TABS.map((t) => (
              <FilterChip
                key={t.key}
                active={filterRange === t.key}
                href={filterHref({ range: t.key })}
              >
                {t.label}
              </FilterChip>
            ))}
          </FilterRow>
          <FilterRow label="Vertical">
            {VERTICAL_TABS.map((t) => (
              <FilterChip
                key={t.key || 'all'}
                active={filterVertical === t.key}
                href={filterHref({ vertical: t.key })}
              >
                {t.label}
              </FilterChip>
            ))}
          </FilterRow>
          <FilterRow label="Status">
            {STATUS_TABS.map((t) => (
              <FilterChip
                key={t.key || 'all'}
                active={filterStatus === t.key}
                href={filterHref({ status: t.key })}
              >
                {t.label}
              </FilterChip>
            ))}
          </FilterRow>
          <FilterRow label="Oraș">
            {/* GET form — no client JS; scales as we add cities. */}
            <form
              method="GET"
              action="/dashboard/admin/marketplace"
              className="flex items-center gap-1.5"
            >
              {filterStatus && <input type="hidden" name="status" value={filterStatus} />}
              {filterVertical && <input type="hidden" name="vertical" value={filterVertical} />}
              {filterRange && filterRange !== '7d' && (
                <input type="hidden" name="range" value={filterRange} />
              )}
              <select
                name="city"
                defaultValue={filterCity}
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
                Aplică
              </button>
              {filterCity && (
                <Link
                  href={filterHref({ city: '' })}
                  className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-slate-200"
                >
                  Resetează oraș
                </Link>
              )}
            </form>
          </FilterRow>
        </div>

        {/* ── Recent listings ──────────────────────────────────── */}
        <h2 className="mt-8 font-display text-lg font-semibold">
          Cereri recente <span className="text-xs font-normal text-slate-500">(toate tenanții)</span>
        </h2>
        <div className="mt-3 overflow-hidden rounded-2xl border border-slate-800">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-800 bg-slate-900/60">
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2.5">Creată</th>
                <th className="px-4 py-2.5">Vendor</th>
                <th className="px-4 py-2.5">Vertical</th>
                <th className="px-4 py-2.5">Oraș</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5">Interval livrare</th>
                <th className="px-4 py-2.5 text-right">Acțiuni</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {listings.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-sm text-slate-500">
                    Nicio cerere pentru filtrele selectate.
                  </td>
                </tr>
              ) : (
                listings.map((l) => (
                  <tr key={l.id} className="hover:bg-slate-900/40">
                    <td className="whitespace-nowrap px-4 py-2.5 text-xs text-slate-400">
                      {fmtDateTime(l.created_at)}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-300">
                      {tenantLabels[l.vendor_tenant_id] ?? (
                        <span className="font-mono text-[10px] text-slate-500">
                          {l.vendor_tenant_id.slice(0, 8)}…
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-300">
                      <VerticalBadge vertical={l.vertical} />
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-300">
                      {l.city_id ? (cityLabels[l.city_id] ?? '—') : '—'}
                    </td>
                    <td className="px-4 py-2.5">
                      <ListingStatusBadge status={l.status} />
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-400">
                      <span className="block">{fmtDateTime(l.delivery_window_start)}</span>
                      <span className="block text-slate-500">→ {fmtDateTime(l.delivery_window_end)}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <DisabledActionButton title="Anulează cererea (cablare la settlement post-MVP)">
                        Anulează
                      </DisabledActionButton>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] text-slate-600">{listings.length} cereri (max 50)</p>

        {/* ── Recent matches ───────────────────────────────────── */}
        <h2 className="mt-8 font-display text-lg font-semibold">
          Atribuiri recente <span className="text-xs font-normal text-slate-500">(matched_at)</span>
        </h2>
        <div className="mt-3 overflow-hidden rounded-2xl border border-slate-800">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-800 bg-slate-900/60">
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2.5">Când</th>
                <th className="px-4 py-2.5">Vendor</th>
                <th className="px-4 py-2.5">Flotă</th>
                <th className="px-4 py-2.5">Oraș</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5 text-right">Preț</th>
                <th className="px-4 py-2.5 text-right">Comision HIR</th>
                <th className="px-4 py-2.5">Dispută</th>
                <th className="px-4 py-2.5 text-right">Acțiuni</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {matches.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-sm text-slate-500">
                    Nicio atribuire pentru intervalul selectat.
                  </td>
                </tr>
              ) : (
                matches.map((m) => {
                  const listing = matchListingIndex[m.listing_id];
                  const vendorLabel = listing
                    ? (tenantLabels[listing.vendor_tenant_id] ?? listing.vendor_tenant_id.slice(0, 8))
                    : '—';
                  const cityLabel = listing?.city_id ? (cityLabels[listing.city_id] ?? '—') : '—';
                  return (
                    <tr key={m.id} className="hover:bg-slate-900/40">
                      <td className="whitespace-nowrap px-4 py-2.5 text-xs text-slate-400">
                        {fmtDateTime(m.matched_at)}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-slate-300">{vendorLabel}</td>
                      <td className="px-4 py-2.5 text-xs text-slate-300">
                        {fleetLabels[m.fleet_id] ?? (
                          <span className="font-mono text-[10px] text-slate-500">
                            {m.fleet_id.slice(0, 8)}…
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-slate-300">{cityLabel}</td>
                      <td className="px-4 py-2.5">
                        <MatchStatusBadge status={m.status} />
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right text-xs tabular-nums text-slate-300">
                        {fmtRonFromCents(m.final_price_cents)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right text-xs tabular-nums text-slate-300">
                        {fmtRonFromCents(m.hir_fee_cents)}
                      </td>
                      <td className="px-4 py-2.5 text-xs">
                        {m.status === 'DISPUTED' || m.dispute_reason ? (
                          <span
                            className="text-rose-300"
                            title={m.dispute_reason ?? ''}
                          >
                            {m.dispute_reason ? m.dispute_reason.slice(0, 40) : 'Dispută activă'}
                          </span>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="inline-flex gap-1">
                          <DisabledActionButton title="Forțează respingerea ofertei (cablare la settlement post-MVP)">
                            Respinge
                          </DisabledActionButton>
                          <DisabledActionButton title="Marchează ca dispută (cablare la settlement post-MVP)">
                            Dispută
                          </DisabledActionButton>
                          <DisabledActionButton title="Rambursează (cablare la settlement post-MVP)">
                            Refund
                          </DisabledActionButton>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] text-slate-600">
          {matches.length} atribuiri (max 50). Butoanele de acțiune se vor lega la stratul de
          settlement (escrow + autofactură) după validarea pilotului.
        </p>

        {/* ── Audit trail ──────────────────────────────────────── */}
        <h2 className="mt-8 font-display text-lg font-semibold">
          Jurnal acțiuni <span className="text-xs font-normal text-slate-500">(marketplace.*)</span>
        </h2>
        <div className="mt-3 overflow-hidden rounded-2xl border border-slate-800">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-800 bg-slate-900/60">
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2.5">Când</th>
                <th className="px-4 py-2.5">Acțiune</th>
                <th className="px-4 py-2.5">Vendor</th>
                <th className="px-4 py-2.5">Entitate</th>
                <th className="px-4 py-2.5">Detalii</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {auditRows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-500">
                    Niciun eveniment marketplace în intervalul selectat.
                  </td>
                </tr>
              ) : (
                auditRows.map((a) => {
                  const oldStatus =
                    a.metadata && typeof a.metadata === 'object'
                      ? (a.metadata as Record<string, unknown>).old_status
                      : null;
                  const newStatus =
                    a.metadata && typeof a.metadata === 'object'
                      ? (a.metadata as Record<string, unknown>).new_status
                      : null;
                  return (
                    <tr key={a.id} className="hover:bg-slate-900/40">
                      <td className="whitespace-nowrap px-4 py-2.5 text-xs text-slate-400">
                        {fmtDateTime(a.created_at)}
                      </td>
                      <td className="px-4 py-2.5 text-xs font-medium text-slate-200">
                        {a.action}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-slate-300">
                        {tenantLabels[a.tenant_id] ?? (
                          <span className="font-mono text-[10px] text-slate-500">
                            {a.tenant_id.slice(0, 8)}…
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-slate-400">
                        {a.entity_type ?? '—'}
                        {a.entity_id && (
                          <span className="ml-1 font-mono text-[10px] text-slate-600">
                            {a.entity_id.slice(0, 8)}…
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-slate-400">
                        {oldStatus || newStatus ? (
                          <span>
                            {String(oldStatus ?? '—')} → {String(newStatus ?? '—')}
                          </span>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] text-slate-600">
          Sursă: trigger `trg_log_marketplace_match_change` (20260616_009 §8). Acoperă INSERT și
          tranziții de status pe marketplace_matches.
        </p>
      </section>
    </main>
  );
}

// ────────────────────────────────────────────────────────────
// Sub-components.
// ────────────────────────────────────────────────────────────

function FilterRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="min-w-[64px] text-[11px] uppercase tracking-wide text-slate-500">
        {label}
      </span>
      <div className="flex flex-wrap items-center gap-1.5">{children}</div>
    </div>
  );
}

function FilterChip({
  active,
  href,
  children,
}: {
  active: boolean;
  href: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <Link
      href={href}
      className={`rounded-lg px-3 py-1.5 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8e3bb0] focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 ${
        active
          ? 'bg-[#6b1f8a] text-white'
          : 'border border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800'
      }`}
    >
      {children}
    </Link>
  );
}

function DisabledActionButton({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <button
      type="button"
      disabled
      title={title}
      aria-disabled="true"
      className="cursor-not-allowed rounded-lg border border-slate-800 bg-slate-900/40 px-2 py-1 text-[11px] font-medium text-slate-500"
    >
      {children}
    </button>
  );
}
