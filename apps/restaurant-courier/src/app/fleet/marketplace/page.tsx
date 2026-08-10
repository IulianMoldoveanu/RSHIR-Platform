// B2B Marketplace — fleet-side dashboard (Stream 6/9).
// Strategy Master Plan Section 5. Gated by HIR_FEATURE_MARKETPLACE_ENABLED.
//
// KPI tiles + preview of open listings in this fleet's primary city.
// Detail discovery lives at /fleet/marketplace/listings.

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight, Banknote, CheckCircle2, FileSearch, Gavel } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireFleetManager } from '@/lib/fleet-manager';
import {
  PageHeader,
  StatCard,
  Card,
  VerticalBadge,
  EmptyMarketplaceState,
} from '@/app/_marketplace-ui';

export const dynamic = 'force-dynamic';

type ListingPreview = {
  id: string;
  city_id: string | null;
  vertical: string;
  delivery_window_start: string;
  delivery_window_end: string;
  package_description: string | null;
  pickup_address: Record<string, unknown> | null;
};

type OfferRow = {
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED' | 'WITHDRAWN';
};

type MatchRow = {
  status: 'MATCHED' | 'IN_PROGRESS' | 'DELIVERED' | 'CANCELLED' | 'DISPUTED' | 'REFUNDED';
  hir_fee_cents: number | null;
  final_price_cents: number | null;
  matched_at: string;
};

function formatRon(cents: number | null | undefined): string {
  if (cents == null || !Number.isFinite(cents)) return '—';
  return `${(cents / 100).toFixed(2)} RON`;
}

function formatWindow(startIso: string, endIso: string): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return '—';
  const dateFmt = new Intl.DateTimeFormat('ro-RO', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
  const timeFmt = new Intl.DateTimeFormat('ro-RO', { hour: '2-digit', minute: '2-digit' });
  return `${dateFmt.format(start)} → ${timeFmt.format(end)}`;
}

export default async function FleetMarketplaceDashboard() {
  if (process.env.HIR_FEATURE_MARKETPLACE_ENABLED !== 'true') notFound();

  const fleet = await requireFleetManager();
  const admin = createAdminClient();

  // Month-to-date window for the "fees paid this month" placeholder. We
  // compute it locally instead of rounding to UTC midnight so the manager's
  // view matches their wall clock.
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  // The fleet's primary_city_id is not in the FleetContext today — fetch it
  // here so we can scope the "open listings in my city" preview. Same single
  // read also yields nothing if the city is unset, in which case we show
  // platform-wide opens so an un-bound fleet still sees the marketplace.
  const { data: fleetRow } = await admin
    .from('courier_fleets')
    .select('primary_city_id')
    .eq('id', fleet.fleetId)
    .maybeSingle();
  const primaryCityId =
    (fleetRow as { primary_city_id: string | null } | null)?.primary_city_id ?? null;

  // Build the open-listings query with the city filter applied conditionally
  // — Supabase JS returns a query builder, so this is just a chain.
  let openListingsQuery = admin
    .from('marketplace_listings')
    .select(
      'id, city_id, vertical, delivery_window_start, delivery_window_end, package_description, pickup_address',
    )
    .eq('status', 'OPEN')
    // Skip OPEN rows whose delivery window has already passed — the cron
    // sweep that flips them to EXPIRED runs every 5 minutes, so this
    // belt-and-suspenders filter avoids surfacing a bidable card the fleet
    // would only later see vanish.
    .gt('delivery_window_end', new Date().toISOString());
  if (primaryCityId) {
    openListingsQuery = openListingsQuery.eq('city_id', primaryCityId);
  }

  // Fan out the four reads in parallel — none depend on the others. We cap
  // each at a small page; the preview only needs ~5 rows, and the KPI
  // counts come from short status lists.
  const [
    { data: openListingsData },
    { data: myPendingOffersData },
    { data: myMatchesData },
    { data: myMatchesMtdData },
  ] = await Promise.all([
    openListingsQuery.order('delivery_window_start', { ascending: true }).limit(5),
    admin
      .from('marketplace_offers')
      .select('status')
      .eq('fleet_id', fleet.fleetId)
      .eq('status', 'PENDING'),
    admin
      .from('marketplace_matches')
      .select('status, hir_fee_cents, final_price_cents, matched_at')
      .eq('fleet_id', fleet.fleetId)
      .order('matched_at', { ascending: false })
      .limit(50),
    admin
      .from('marketplace_matches')
      .select('hir_fee_cents')
      .eq('fleet_id', fleet.fleetId)
      .gte('matched_at', monthStart.toISOString()),
  ]);

  const openListings = (openListingsData ?? []) as ListingPreview[];
  const pendingOffers = (myPendingOffersData ?? []) as OfferRow[];
  const matches = (myMatchesData ?? []) as MatchRow[];
  const mtdMatches = (myMatchesMtdData ?? []) as Array<{ hir_fee_cents: number | null }>;

  // Active matches = anything not in a terminal failure state. DELIVERED is
  // still relevant for the manager's "won bids" count this view shows.
  const acceptedCount = matches.filter((m) =>
    ['MATCHED', 'IN_PROGRESS', 'DELIVERED'].includes(m.status),
  ).length;
  const feesMtdCents = mtdMatches.reduce(
    (sum, m) => sum + (Number(m.hir_fee_cents) || 0),
    0,
  );

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <PageHeader
        variant="hero"
        eyebrow="Marketplace flotă"
        title="Marketplace"
        description="Cereri B2B din orașul flotei — ofertează, câștigă livrarea."
      />

      {/* KPI grid — open listings, my pending offers, my wins, fees MTD. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          icon={<FileSearch className="h-4 w-4" strokeWidth={1.75} aria-hidden />}
          label="Cereri deschise"
          value={String(openListings.length)}
          hint="în orașul flotei"
        />
        <StatCard
          icon={<Gavel className="h-4 w-4" strokeWidth={1.75} aria-hidden />}
          label="Ofertele mele"
          value={String(pendingOffers.length)}
          hint="în așteptare"
        />
        <StatCard
          icon={<CheckCircle2 className="h-4 w-4" strokeWidth={1.75} aria-hidden />}
          label="Câștigate"
          value={String(acceptedCount)}
          hint="ultimele 50"
        />
        <StatCard
          icon={<Banknote className="h-4 w-4" strokeWidth={1.75} aria-hidden />}
          label="Taxe HIR luna"
          value={formatRon(feesMtdCents)}
          hint="comision platformă"
        />
      </div>

      {/* Open listings preview */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-hir-fg">
            Cereri deschise{' '}
            <span className="tabular-nums text-hir-muted-fg">({openListings.length})</span>
          </h2>
          <Link
            href="/fleet/marketplace/listings"
            className="inline-flex items-center gap-1 rounded-md text-xs font-medium text-violet-300 hover:text-violet-200"
          >
            Vezi toate
            <ArrowRight className="h-3 w-3" strokeWidth={1.75} aria-hidden />
          </Link>
        </div>
        {openListings.length === 0 ? (
          <EmptyMarketplaceState
            title="Nicio cerere deschisă"
            description="Nu sunt cereri deschise în orașul flotei."
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {openListings.map((listing) => (
              <Card
                key={listing.id}
                as="li"
                interactive
                href={`/fleet/marketplace/listings/${listing.id}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <VerticalBadge vertical={listing.vertical} />
                      <p className="truncate text-sm font-semibold text-hir-fg">
                        {listing.package_description ?? 'Pachet'}
                      </p>
                    </div>
                    <p className="mt-1.5 text-xs text-hir-muted-fg">
                      Fereastră:{' '}
                      <span className="tabular-nums">
                        {formatWindow(listing.delivery_window_start, listing.delivery_window_end)}
                      </span>
                    </p>
                  </div>
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-violet-500/15 px-2 py-1 text-[11px] font-semibold text-violet-200">
                    Ofertează
                    <ArrowRight className="h-3 w-3" strokeWidth={1.75} aria-hidden />
                  </span>
                </div>
              </Card>
            ))}
          </ul>
        )}
      </section>

      {/* Quick links to the deep views. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <QuickLink
          href="/fleet/marketplace/offers"
          icon={<Gavel className="h-4 w-4" strokeWidth={1.75} aria-hidden />}
          label="Ofertele mele"
          hint={`${pendingOffers.length} în așteptare`}
        />
        <QuickLink
          href="/fleet/marketplace/matches"
          icon={<CheckCircle2 className="h-4 w-4" strokeWidth={1.75} aria-hidden />}
          label="Livrări câștigate"
          hint={`${acceptedCount} active`}
        />
      </div>
    </div>
  );
}

function QuickLink({
  href,
  icon,
  label,
  hint,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  hint: string;
}) {
  return (
    <Card interactive href={href} className="flex items-center gap-3">
      <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-violet-500/10 text-violet-300">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-hir-fg">{label}</p>
        <p className="text-xs text-hir-muted-fg">{hint}</p>
      </div>
      <ArrowRight className="h-4 w-4 flex-shrink-0 text-hir-muted-fg" strokeWidth={1.75} aria-hidden />
    </Card>
  );
}
