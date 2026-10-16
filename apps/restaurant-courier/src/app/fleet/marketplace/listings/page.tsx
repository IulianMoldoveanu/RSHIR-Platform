// B2B Marketplace — fleet-side OPEN listings browse (Stream 6/9).
// Strategy Master Plan Section 5. Gated by HIR_FEATURE_MARKETPLACE_ENABLED.
//
// Lists every OPEN marketplace_listing the fleet can bid on, optionally
// filtered by city + vertical. Card-per-row so the manager can scan at a
// glance which window is closing first and tap through to the bid form.

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ArrowRight, MapPin, Package } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireFleetManager } from '@/lib/fleet-manager';
import {
  PageHeader,
  Card,
  VerticalBadge,
  OfferStatusBadge,
  ETAPill,
  EmptyMarketplaceState,
  buttonClass,
} from '@/app/_marketplace-ui';

export const dynamic = 'force-dynamic';

type ListingRow = {
  id: string;
  city_id: string | null;
  vertical: string;
  delivery_window_start: string;
  delivery_window_end: string;
  package_description: string | null;
  package_weight_grams: number | null;
  pickup_address: Record<string, unknown> | null;
  created_at: string;
};

type CityRow = {
  id: string;
  name: string;
  county: string | null;
};

type SearchParams = {
  city?: string; // 'all' | 'mine' | uuid
  vertical?: string;
};

function pickupSummary(addr: Record<string, unknown> | null): string {
  if (!addr) return '—';
  // The listing-create edge fn forbids customer PII keys in pickup/dropoff,
  // so it's safe to surface area/street/zone fields straight to the fleet.
  const street = (addr.street ?? addr.line1 ?? addr.address) as string | undefined;
  const area = (addr.area ?? addr.neighborhood ?? addr.zone) as string | undefined;
  return [street, area].filter(Boolean).join(' · ') || '—';
}

export default async function FleetMarketplaceListings({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  if (process.env.HIR_FEATURE_MARKETPLACE_ENABLED !== 'true') notFound();

  const fleet = await requireFleetManager();
  const admin = createAdminClient();
  const params = await searchParams;

  // Pull the fleet's primary_city_id so we can default-filter to it.
  const { data: fleetRow } = await admin
    .from('courier_fleets')
    .select('primary_city_id')
    .eq('id', fleet.fleetId)
    .maybeSingle();
  const primaryCityId =
    (fleetRow as { primary_city_id: string | null } | null)?.primary_city_id ?? null;

  // City filter resolution:
  //   - explicit 'all'              → no city filter
  //   - explicit uuid               → that city
  //   - 'mine' or unset             → fleet's primary city (or no filter
  //                                    when fleet has no primary city)
  // The select shows the resolved value so the manager always knows what's
  // active.
  const cityParam = params.city ?? 'mine';
  let cityFilter: string | null;
  if (cityParam === 'all') cityFilter = null;
  else if (/^[0-9a-f-]{36}$/i.test(cityParam)) cityFilter = cityParam;
  else cityFilter = primaryCityId;

  const verticalParam = params.vertical ?? 'all';
  const verticalFilter =
    verticalParam !== 'all' &&
    ['restaurant', 'pharmacy', 'retail', 'other'].includes(verticalParam)
      ? verticalParam
      : null;

  // Build the listings query — same skeleton as the dashboard preview but
  // larger page size and supports the optional filters.
  let listingsQuery = admin
    .from('marketplace_listings')
    .select(
      'id, city_id, vertical, delivery_window_start, delivery_window_end, package_description, package_weight_grams, pickup_address, created_at',
    )
    .eq('status', 'OPEN')
    .gt('delivery_window_end', new Date().toISOString());
  if (cityFilter) listingsQuery = listingsQuery.eq('city_id', cityFilter);
  if (verticalFilter) listingsQuery = listingsQuery.eq('vertical', verticalFilter);

  // Fan out: listings + cities for the picker. Cities list is small (<320
  // rows seeded) so we can pull all of them sorted alphabetically.
  const [{ data: listingsData }, { data: citiesData }, { data: myOffersData }] =
    await Promise.all([
      listingsQuery
        .order('delivery_window_start', { ascending: true })
        .limit(50),
      admin
        .from('cities')
        .select('id, name, county')
        .order('name', { ascending: true }),
      // Pull the fleet's own offers so we can mark already-bid listings
      // with an "Ofertat" chip and avoid the manager wondering why a
      // listing appears unbid in their view.
      admin
        .from('marketplace_offers')
        .select('listing_id, status')
        .eq('fleet_id', fleet.fleetId)
        .in('status', ['PENDING', 'ACCEPTED']),
    ]);

  const listings = (listingsData ?? []) as ListingRow[];
  const cities = (citiesData ?? []) as CityRow[];
  const myOffers = (myOffersData ?? []) as Array<{ listing_id: string; status: string }>;
  const myOfferByListing = new Map(myOffers.map((o) => [o.listing_id, o.status]));

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <PageHeader
        variant="shell"
        title="Cereri deschise"
        description={`${listings.length} cereri active — alege una și trimite o ofertă.`}
        breadcrumb={
          <Link
            href="/fleet/marketplace"
            className="inline-flex items-center gap-1 rounded-md font-medium text-hir-muted-fg hover:text-hir-fg"
          >
            <ArrowLeft className="h-3 w-3" strokeWidth={1.75} aria-hidden />
            Marketplace
          </Link>
        }
      />

      {/* Filter bar — form GETs back to this page so filters end up in URL
          and the manager can bookmark a particular view (e.g. pharmacy
          only). Defaults are "my city" + all verticals. */}
      <form
        method="GET"
        className="flex flex-wrap items-end gap-3 rounded-2xl border border-hir-border bg-hir-surface p-4"
      >
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-hir-muted-fg">
          <span>Oraș</span>
          <select
            name="city"
            defaultValue={cityParam}
            className="rounded-md border border-hir-border bg-hir-bg px-3 py-2 text-sm font-normal normal-case tracking-normal text-hir-fg"
          >
            <option value="mine">
              {primaryCityId ? 'Orașul flotei' : 'Toate orașele (flotă fără oraș)'}
            </option>
            <option value="all">Toate orașele</option>
            {cities.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.county ? `, ${c.county}` : ''}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-hir-muted-fg">
          <span>Vertical</span>
          <select
            name="vertical"
            defaultValue={verticalParam}
            className="rounded-md border border-hir-border bg-hir-bg px-3 py-2 text-sm font-normal normal-case tracking-normal text-hir-fg"
          >
            <option value="all">Toate</option>
            <option value="restaurant">Restaurant</option>
            <option value="pharmacy">Farmacie</option>
            <option value="retail">Retail</option>
            <option value="other">Alt tip</option>
          </select>
        </label>
        <button type="submit" className={buttonClass('primary', 'md')}>
          Aplică
        </button>
      </form>

      {/* Listings — empty state explains the most common cause (no city set
          on the fleet) so the manager knows where to act. */}
      {listings.length === 0 ? (
        <EmptyMarketplaceState
          title="Nu sunt cereri deschise."
          description={
            primaryCityId
              ? 'Încearcă altă combinație de filtre sau revino mai târziu.'
              : 'Setează orașul flotei în /fleet/settings ca să primești cereri din zona ta.'
          }
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {listings.map((listing) => {
            const myStatus = myOfferByListing.get(listing.id);
            return (
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
                      {myStatus === 'ACCEPTED' ? (
                        <OfferStatusBadge status="ACCEPTED" />
                      ) : myStatus ? (
                        <OfferStatusBadge status="PENDING" />
                      ) : null}
                    </div>
                    <p className="mt-2 flex items-center gap-1.5 text-xs text-hir-muted-fg">
                      <MapPin className="h-3 w-3 flex-shrink-0" strokeWidth={1.75} aria-hidden />
                      <span className="truncate">{pickupSummary(listing.pickup_address)}</span>
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-hir-muted-fg">
                      <ETAPill
                        startIso={listing.delivery_window_start}
                        endIso={listing.delivery_window_end}
                      />
                      {listing.package_weight_grams != null ? (
                        <span className="inline-flex items-center gap-1 tabular-nums">
                          <Package className="h-3 w-3" strokeWidth={1.75} aria-hidden />
                          {(listing.package_weight_grams / 1000).toFixed(1)} kg
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-violet-500/15 px-2 py-1 text-[11px] font-semibold text-violet-200">
                    Ofertează
                    <ArrowRight className="h-3 w-3" strokeWidth={1.75} aria-hidden />
                  </span>
                </div>
              </Card>
            );
          })}
        </ul>
      )}
    </div>
  );
}
