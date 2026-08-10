// B2B Marketplace — vendor listings index.
//
// Strategy Master Plan Section 5 (B2B Marketplace), Stream 5/9 (UI vendor side).
// Lists all listings owned by the tenants the current user belongs to, with
// status badges, offer counts, and quick filters by status.
//
// Feature flag: HIR_FEATURE_MARKETPLACE_ENABLED gates the whole surface via
// notFound() at the top. Once flipped on, RLS in 20260616_009 limits the rows
// fetched by the typed admin client (service_role bypasses RLS, so we filter
// by tenant_members explicitly to keep the data-plane honest).

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClientUntyped } from '@/lib/supabase/admin';
import {
  PageHeader,
  Card,
  StatCard,
  ButtonLink,
  Icon,
  VerticalBadge,
  RouteSteps,
  ETAPill,
  ListingStatusBadge,
  EmptyMarketplaceState,
  ErrorState,
} from '@/app/marketplace/_components/ui';

export const dynamic = 'force-dynamic';

type ListingStatus =
  | 'DRAFT'
  | 'OPEN'
  | 'MATCHED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'DISPUTED';

type ListingRow = {
  id: string;
  vertical: string;
  status: ListingStatus;
  city_name: string | null;
  delivery_window_start: string;
  delivery_window_end: string;
  pickup_summary: string;
  dropoff_summary: string;
  package_description: string | null;
  created_at: string;
  offer_count: number;
};

// Presentational status filter tabs (URL state via ?status=). Pure client-side
// filtering of the already-fetched array — the query/.in() scoping is untouched.
type StatusFilter = 'all' | 'open' | 'matched' | 'completed';

const STATUS_TABS: { key: StatusFilter; label: string; match: (s: ListingStatus) => boolean }[] = [
  { key: 'all', label: 'Toate', match: () => true },
  { key: 'open', label: 'Deschise', match: (s) => s === 'OPEN' || s === 'DRAFT' },
  {
    key: 'matched',
    label: 'Atribuite',
    match: (s) => s === 'MATCHED' || s === 'IN_PROGRESS',
  },
  { key: 'completed', label: 'Finalizate', match: (s) => s === 'COMPLETED' },
];

function summarizeAddress(addr: unknown): string {
  if (!addr || typeof addr !== 'object') return '—';
  const a = addr as Record<string, unknown>;
  const parts: string[] = [];
  if (typeof a.street === 'string') parts.push(a.street);
  if (typeof a.number === 'string') parts.push(a.number);
  if (typeof a.city === 'string') parts.push(a.city);
  const joined = parts.filter(Boolean).join(' ');
  return joined === '' ? '—' : joined;
}

export default async function MarketplaceListingsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}): Promise<JSX.Element> {
  if (process.env.HIR_FEATURE_MARKETPLACE_ENABLED !== 'true') notFound();

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClientUntyped();

  // 1. Resolve the tenants the user belongs to. Empty list = no marketplace
  //    access (the user belongs to no vendor tenant).
  const { data: memberships, error: memberErr } = await admin
    .from('tenant_members')
    .select('tenant_id, tenants:tenants(id, name)')
    .eq('user_id', user.id);

  if (memberErr) {
    return (
      <main className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-10">
        <PageHeader
          variant="hero"
          eyebrow="HIR · MARKETPLACE"
          title="Cererile mele"
          description="Publică o cerere de livrare B2B și primește oferte de la flotele HIR."
        />
        <div className="mt-6">
          <ErrorState description="Nu am putut încărca restaurantele. Reîncarcă pagina sau revino mai târziu." />
        </div>
      </main>
    );
  }

  const tenantIds: string[] = (memberships ?? [])
    .map((m: { tenant_id: string | null }) => m.tenant_id)
    .filter((x: string | null): x is string => typeof x === 'string' && x.length > 0);

  if (tenantIds.length === 0) {
    return (
      <main className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-10">
        <PageHeader
          variant="hero"
          eyebrow="HIR · MARKETPLACE"
          title="Cererile mele"
          description="Publică o cerere de livrare B2B și primește oferte de la flotele HIR."
        />
        <div className="mt-6">
          <EmptyMarketplaceState
            title="Niciun restaurant asociat"
            description="Nu ești asociat niciunui restaurant. Contactează administratorul HIR pentru acces."
          />
        </div>
      </main>
    );
  }

  // 2. Fetch listings for those tenants. Embed city for display, count offers
  //    inline via the embedded relation.
  const { data: rawListings, error: listingsErr } = await admin
    .from('marketplace_listings')
    .select(
      [
        'id',
        'vertical',
        'status',
        'delivery_window_start',
        'delivery_window_end',
        'pickup_address',
        'dropoff_address',
        'package_description',
        'created_at',
        'cities:cities(name)',
        'marketplace_offers(count)',
      ].join(', '),
    )
    .in('vendor_tenant_id', tenantIds)
    .order('created_at', { ascending: false })
    .limit(100);

  if (listingsErr) {
    return (
      <main className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-10">
        <PageHeader
          variant="hero"
          eyebrow="HIR · MARKETPLACE"
          title="Cererile mele"
          description="Publică o cerere de livrare B2B și primește oferte de la flotele HIR."
        />
        <div className="mt-6">
          <ErrorState description="Nu am putut încărca cererile. Reîncarcă pagina sau revino mai târziu." />
        </div>
      </main>
    );
  }

  const listings: ListingRow[] = (rawListings ?? []).map(
    (r: {
      id: string;
      vertical: string;
      status: ListingStatus;
      delivery_window_start: string;
      delivery_window_end: string;
      pickup_address: unknown;
      dropoff_address: unknown;
      package_description: string | null;
      created_at: string;
      cities: { name: string } | null;
      marketplace_offers: Array<{ count: number }> | { count: number } | null;
    }) => {
      let offerCount = 0;
      if (Array.isArray(r.marketplace_offers)) {
        offerCount = r.marketplace_offers.reduce(
          (n: number, x: { count: number }) => n + (Number(x.count) || 0),
          0,
        );
      } else if (r.marketplace_offers && typeof r.marketplace_offers === 'object') {
        offerCount = Number((r.marketplace_offers as { count: number }).count) || 0;
      }
      return {
        id: r.id,
        vertical: r.vertical,
        status: r.status,
        city_name: r.cities?.name ?? null,
        delivery_window_start: r.delivery_window_start,
        delivery_window_end: r.delivery_window_end,
        pickup_summary: summarizeAddress(r.pickup_address),
        dropoff_summary: summarizeAddress(r.dropoff_address),
        package_description: r.package_description,
        created_at: r.created_at,
        offer_count: offerCount,
      };
    },
  );

  // Presentation-only counts derived from the in-memory array (no extra query).
  const activeCount = listings.filter(
    (l) => l.status === 'OPEN' || l.status === 'DRAFT',
  ).length;
  const totalOffers = listings.reduce((n, l) => n + l.offer_count, 0);
  const matchedCount = listings.filter(
    (l) => l.status === 'MATCHED' || l.status === 'IN_PROGRESS' || l.status === 'COMPLETED',
  ).length;

  const { status: rawStatus } = await searchParams;
  const activeTab: StatusFilter =
    STATUS_TABS.find((t) => t.key === rawStatus)?.key ?? 'all';
  const tabMatch = STATUS_TABS.find((t) => t.key === activeTab)!.match;
  const visibleListings = listings.filter((l) => tabMatch(l.status));

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-10">
      <PageHeader
        variant="hero"
        eyebrow="HIR · MARKETPLACE"
        title="Cererile mele"
        description="Publică o cerere de livrare B2B și primește oferte de la flotele HIR."
        actions={
          <ButtonLink href="/marketplace/listings/new" variant="primary">
            <Icon name="plus" />
            Cerere nouă
          </ButtonLink>
        }
      />

      <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 md:gap-4">
        <StatCard label="Cereri active" value={activeCount} icon={<Icon name="package" />} />
        <StatCard
          label="Oferte primite"
          value={totalOffers}
          icon={<Icon name="banknote" />}
          hint="Total, toate cererile"
        />
        <StatCard label="Atribuite" value={matchedCount} icon={<Icon name="truck" />} />
        <StatCard label="Total cereri" value={listings.length} icon={<Icon name="file-search" />} />
      </section>

      <nav
        className="mt-6 flex flex-wrap gap-2"
        aria-label="Filtrează cererile după status"
      >
        {STATUS_TABS.map((t) => {
          const isActive = t.key === activeTab;
          return (
            <Link
              key={t.key}
              href={t.key === 'all' ? '/marketplace/listings' : `/marketplace/listings?status=${t.key}`}
              aria-current={isActive ? 'page' : undefined}
              className={
                isActive
                  ? 'inline-flex items-center rounded-full bg-gradient-to-br from-[#6b1f8a] to-[#8e3bb0] px-3 py-1.5 text-xs font-semibold text-white shadow-[0_2px_8px_rgba(107,31,138,0.25)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6b1f8a] focus-visible:ring-offset-2'
                  : 'inline-flex items-center rounded-full bg-white px-3 py-1.5 text-xs font-medium text-slate-600 ring-1 ring-inset ring-slate-200 transition hover:bg-[#f7f0fb] hover:text-[#6b1f8a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6b1f8a] focus-visible:ring-offset-2'
              }
            >
              {t.label}
            </Link>
          );
        })}
      </nav>

      {visibleListings.length === 0 ? (
        <div className="mt-6">
          <EmptyMarketplaceState
            title={listings.length === 0 ? 'Nicio cerere încă' : 'Nicio cerere în acest filtru'}
            description={
              listings.length === 0
                ? 'Publică prima cerere de livrare și primește oferte de la flotele HIR.'
                : 'Schimbă filtrul de mai sus pentru a vedea alte cereri.'
            }
            action={
              listings.length === 0 ? (
                <ButtonLink href="/marketplace/listings/new" variant="primary">
                  <Icon name="plus" />
                  Publică prima cerere
                </ButtonLink>
              ) : undefined
            }
          />
        </div>
      ) : (
        <ul className="mt-6 grid list-none gap-4 md:grid-cols-2">
          {visibleListings.map((l) => (
            <Card
              key={l.id}
              as="li"
              accent
              interactive
              href={`/marketplace/listings/${l.id}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-bold text-[#23093a]">
                    {l.package_description?.trim() || `Cerere #${l.id.slice(0, 8)}`}
                  </h2>
                  <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                    <Icon name="map-pin" className="h-3.5 w-3.5" />
                    <span>{l.city_name ?? 'fără oraș'}</span>
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <ListingStatusBadge status={l.status} />
                  <VerticalBadge vertical={l.vertical} />
                </div>
              </div>

              <div className="mt-4">
                <RouteSteps pickup={l.pickup_summary} dropoff={l.dropoff_summary} />
              </div>

              <div className="mt-4">
                <ETAPill
                  startIso={l.delivery_window_start}
                  endIso={l.delivery_window_end}
                />
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                  <Icon name="package" className="h-3.5 w-3.5" />
                  Oferte primite (total):{' '}
                  <span className="font-semibold tabular-nums text-slate-700">
                    {l.offer_count}
                  </span>
                </span>
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#6b1f8a]">
                  Deschide
                  <Icon name="arrow-right" className="h-3.5 w-3.5" />
                </span>
              </div>
            </Card>
          ))}
        </ul>
      )}
    </main>
  );
}
