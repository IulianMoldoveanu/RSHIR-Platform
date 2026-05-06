// Platform-admin global tenant list. Distribution-impact: pilot stability —
// Iulian's daily "where am I" dashboard during the București affiliate tour.
//
// Columns: Restaurant · Oraș · Status · Fleet Managers · Integrări · Comenzi 7z
// Filters (server-side, via URL search params): city, status, sort.
//
// Internal-only — RLS-bypass via service-role client. Gated by
// HIR_PLATFORM_ADMIN_EMAILS, same allow-list pattern as fleet-managers.

import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { TenantsListClient, type TenantListRow, type SortKey, type StatusFilter } from './client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const AGGREGATOR_SOURCES = ['GLOVO', 'WOLT', 'TAZZ', 'FOODPANDA', 'BOLT_FOOD'] as const;

type SearchParams = {
  city?: string;
  status?: string;
  sort?: string;
};

function normalizeCity(raw: string | undefined): string {
  if (!raw) return '';
  return raw.trim().toLowerCase();
}

export default async function PlatformAdminTenantsPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const supa = createServerClient();
  const {
    data: { user },
  } = await supa.auth.getUser();
  if (!user) redirect('/login?next=/dashboard/admin/tenants');

  const allow = (process.env.HIR_PLATFORM_ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  if (!user.email || !allow.includes(user.email.toLowerCase())) {
    return (
      <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
        Acces interzis: această pagină este rezervată administratorilor de
        platformă HIR.
      </div>
    );
  }

  // ── Parse search params (defensive — no client-side filtering) ──
  const cityFilter = normalizeCity(searchParams?.city);
  const statusFilterRaw = (searchParams?.status ?? '').toLowerCase();
  const statusFilter: StatusFilter =
    statusFilterRaw === 'live' || statusFilterRaw === 'onboarding'
      ? statusFilterRaw
      : 'all';
  const sortRaw = (searchParams?.sort ?? '').toLowerCase();
  const sort: SortKey =
    sortRaw === 'name' || sortRaw === 'created' ? sortRaw : 'last_order';

  // ── Single admin client; cast to relaxed shape for legacy/jsonb columns ──
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any;

  // ── 1) Tenants base list (all RESTAURANT vertical, regardless of status) ──
  // We pull *all* RESTAURANT tenants (small N today, ~10) so server-side
  // filters + sort apply over the full dataset, then slice to MAX_ROWS at the
  // end. The cap-after-filter ordering matters: if we capped before sorting
  // by last_order, tenants with recent orders but later in alphabet would
  // be invisible (Codex P2 #1, PR #291).
  const { data: tenantsRaw, error: tErr } = await sb
    .from('tenants')
    .select('id, slug, name, vertical, status, settings, integration_mode, external_dispatch_enabled, created_at, updated_at')
    .eq('vertical', 'RESTAURANT')
    .order('name', { ascending: true });

  if (tErr) {
    return (
      <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
        Eroare la încărcarea restaurantelor: {tErr.message}
      </div>
    );
  }

  type RawTenant = {
    id: string;
    slug: string;
    name: string;
    vertical: string;
    status: string;
    settings: Record<string, unknown> | null;
    integration_mode: string | null;
    external_dispatch_enabled: boolean | null;
    created_at: string;
    updated_at: string | null;
  };
  const baseTenants: RawTenant[] = (tenantsRaw ?? []) as RawTenant[];
  const tenantIds = baseTenants.map((t) => t.id);

  // ── 2) Fleet Manager memberships per tenant ──
  const fmCountByTenant = new Map<string, number>();
  if (tenantIds.length > 0) {
    const { data: fmRows } = await sb
      .from('tenant_members')
      .select('tenant_id')
      .eq('role', 'FLEET_MANAGER')
      .in('tenant_id', tenantIds);
    for (const r of (fmRows ?? []) as { tenant_id: string }[]) {
      fmCountByTenant.set(r.tenant_id, (fmCountByTenant.get(r.tenant_id) ?? 0) + 1);
    }
  }

  // ── 3a) Last 7 days orders per tenant (status <> CANCELLED) ──
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const orders7dByTenant = new Map<string, number>();
  if (tenantIds.length > 0) {
    const { data: orderRows } = await sb
      .from('restaurant_orders')
      .select('tenant_id, status')
      .in('tenant_id', tenantIds)
      .gte('created_at', sevenDaysAgo)
      .limit(5000);
    for (const r of (orderRows ?? []) as { tenant_id: string; status: string }[]) {
      if (r.status !== 'CANCELLED') {
        orders7dByTenant.set(r.tenant_id, (orders7dByTenant.get(r.tenant_id) ?? 0) + 1);
      }
    }
  }

  // ── 3b) Most recent order timestamp per tenant — UNBOUNDED window so
  // tenants whose latest non-cancelled order is older than 7 days still
  // surface a real "Ultima comandă" instead of "fără comenzi" (Codex P2 #2,
  // PR #291). One small query per tenant, run in parallel; with ≤50 tenants
  // this is bounded and faster than a giant scan + JS dedup.
  const lastOrderByTenant = new Map<string, string>();
  if (tenantIds.length > 0) {
    const lookups = await Promise.all(
      tenantIds.map(async (tid) => {
        const { data } = await sb
          .from('restaurant_orders')
          .select('tenant_id, created_at')
          .eq('tenant_id', tid)
          .neq('status', 'CANCELLED')
          .order('created_at', { ascending: false })
          .limit(1);
        return data && data.length > 0
          ? { tenant_id: data[0].tenant_id as string, created_at: data[0].created_at as string }
          : null;
      }),
    );
    for (const r of lookups) {
      if (r) lastOrderByTenant.set(r.tenant_id, r.created_at);
    }
  }

  // ── 4) GloriaFood imports → tenant has GloriaFood integration ──
  const gloriafoodTenants = new Set<string>();
  if (tenantIds.length > 0) {
    const { data: gfRows } = await sb
      .from('gloriafood_import_runs')
      .select('tenant_id')
      .in('tenant_id', tenantIds);
    for (const r of (gfRows ?? []) as { tenant_id: string }[]) {
      gloriafoodTenants.add(r.tenant_id);
    }
  }

  // ── 5) Aggregator order sources (last 30d) per tenant ──
  // Phase 2 not wired yet, so this will be empty for everyone today —
  // future-proof so when Glovo/Wolt webhooks land, the badge lights up.
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const aggregatorsByTenant = new Map<string, Set<string>>();
  if (tenantIds.length > 0) {
    const { data: aggRows } = await sb
      .from('restaurant_orders')
      .select('tenant_id, source')
      .in('tenant_id', tenantIds)
      .in('source', AGGREGATOR_SOURCES as unknown as string[])
      .gte('created_at', thirtyDaysAgo)
      .limit(5000);
    for (const r of (aggRows ?? []) as { tenant_id: string; source: string }[]) {
      if (!aggregatorsByTenant.has(r.tenant_id)) {
        aggregatorsByTenant.set(r.tenant_id, new Set());
      }
      aggregatorsByTenant.get(r.tenant_id)!.add(r.source);
    }
  }

  // ── 6) Active POS integrations per tenant (iiko/freya/posnet/smartcash) ──
  const posByTenant = new Map<string, Set<string>>();
  if (tenantIds.length > 0) {
    const { data: posRows } = await sb
      .from('integration_providers')
      .select('tenant_id, provider_key, is_active')
      .eq('is_active', true)
      .in('tenant_id', tenantIds);
    for (const r of (posRows ?? []) as {
      tenant_id: string;
      provider_key: string;
      is_active: boolean;
    }[]) {
      if (r.provider_key === 'mock') continue;
      if (!posByTenant.has(r.tenant_id)) {
        posByTenant.set(r.tenant_id, new Set());
      }
      posByTenant.get(r.tenant_id)!.add(r.provider_key);
    }
  }

  // ── Compose enriched rows ──
  const allRows: TenantListRow[] = baseTenants.map((t) => {
    const settings = (t.settings ?? {}) as Record<string, unknown>;
    const cityRaw = typeof settings.city === 'string' ? settings.city.trim() : '';
    const onboarding =
      typeof settings.onboarding === 'object' && settings.onboarding !== null
        ? (settings.onboarding as Record<string, unknown>)
        : {};
    const wentLiveAt =
      typeof onboarding.went_live_at === 'string'
        ? (onboarding.went_live_at as string)
        : null;
    const isLive = Boolean(wentLiveAt);

    const aggregators = aggregatorsByTenant.get(t.id);
    const posProviders = posByTenant.get(t.id);
    const integrationBadges: string[] = [];
    if (gloriafoodTenants.has(t.id)) integrationBadges.push('GloriaFood');
    if (aggregators) {
      for (const a of aggregators) integrationBadges.push(a);
    }
    if (posProviders) {
      for (const p of posProviders) integrationBadges.push(p.toUpperCase());
    }

    return {
      id: t.id,
      slug: t.slug,
      name: t.name,
      city: cityRaw || null,
      tenantStatus: t.status,
      isLive,
      wentLiveAt,
      fmCount: fmCountByTenant.get(t.id) ?? 0,
      orders7d: orders7dByTenant.get(t.id) ?? 0,
      lastOrderAt: lastOrderByTenant.get(t.id) ?? null,
      integrationBadges,
      createdAt: t.created_at,
    };
  });

  // ── Apply server-side filters ──
  let rows = allRows;
  if (cityFilter) {
    rows = rows.filter((r) => (r.city ?? '').trim().toLowerCase() === cityFilter);
  }
  if (statusFilter === 'live') rows = rows.filter((r) => r.isLive);
  if (statusFilter === 'onboarding') rows = rows.filter((r) => !r.isLive);

  // ── Apply server-side sort ──
  if (sort === 'name') {
    rows.sort((a, b) => a.name.localeCompare(b.name, 'ro'));
  } else if (sort === 'created') {
    rows.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
  } else {
    // last_order — tenants with orders first (desc), then no-orders by name
    rows.sort((a, b) => {
      if (a.lastOrderAt && b.lastOrderAt) return b.lastOrderAt.localeCompare(a.lastOrderAt);
      if (a.lastOrderAt) return -1;
      if (b.lastOrderAt) return 1;
      return a.name.localeCompare(b.name, 'ro');
    });
  }

  // ── Cap displayed rows AFTER filter + sort so distant-but-relevant tenants
  // still surface (Codex P2 #1, PR #291). Today's count is <10; the cap is
  // defensive for the next 6-12 months before we wire pagination.
  const MAX_ROWS = 50;
  const displayRows = rows.slice(0, MAX_ROWS);

  // ── Distinct city values from full unfiltered list (for filter dropdown) ──
  const citiesSet = new Set<string>();
  for (const r of allRows) {
    if (r.city) citiesSet.add(r.city);
  }
  const cities = Array.from(citiesSet).sort((a, b) => a.localeCompare(b, 'ro'));

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Admin · Restaurante
        </div>
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
          Toate restaurantele ({allRows.length})
        </h1>
        <p className="text-sm text-zinc-600">
          Lista globală cu starea fiecărui restaurant: oraș, activare, fleet
          managers, integrări active și comenzi în ultimele 7 zile. Pagină
          internă HIR.
        </p>
      </header>

      <TenantsListClient
        rows={displayRows}
        totalCount={allRows.length}
        filteredCount={rows.length}
        capped={rows.length > displayRows.length}
        cities={cities}
        currentCity={cityFilter}
        currentStatus={statusFilter}
        currentSort={sort}
      />
    </div>
  );
}
