// B2B Marketplace — fleet-side listing detail + bid form (Stream 6/9).
// Strategy Master Plan Section 5. Gated by HIR_FEATURE_MARKETPLACE_ENABLED.
//
// Shows the listing's package, pickup zone, delivery window, and the fleet's
// own existing offer (if any). Below: the bid form (client island).

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Package, Thermometer } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireFleetManager } from '@/lib/fleet-manager';
import {
  PageHeader,
  Card,
  VerticalBadge,
  RouteSteps,
  OfferStatusBadge,
  ListingStatusBadge,
  EmptyMarketplaceState,
} from '@/app/_marketplace-ui';
import type { ListingStatus, OfferStatus } from '@/app/_marketplace-ui';
import { BidForm } from './_bid-form';

export const dynamic = 'force-dynamic';

type ListingRow = {
  id: string;
  status: string;
  vertical: string;
  delivery_window_start: string;
  delivery_window_end: string;
  package_description: string | null;
  package_weight_grams: number | null;
  package_temperature: string | null;
  pickup_address: Record<string, unknown> | null;
  dropoff_address: Record<string, unknown> | null;
};

type MyOfferRow = {
  id: string;
  offered_price_cents: number;
  eta_minutes: number;
  status: string;
  expires_at: string;
  // Stream 3 (AI matching) — cached 0..100 composite. NULL until first scored.
  ai_match_score: number | string | null;
};

function formatRon(cents: number): string {
  return `${(cents / 100).toFixed(2)} RON`;
}

function formatTs(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '—';
  return new Intl.DateTimeFormat('ro-RO', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

// Map the raw package_temperature enum to a ro-RO label so the fleet never
// sees the bare "ambient"/"chilled" value.
function temperatureLabel(value: string | null): string {
  switch ((value ?? '').toLowerCase()) {
    case 'frozen':
      return 'Congelat';
    case 'chilled':
    case 'refrigerated':
      return 'Refrigerat';
    case 'ambient':
    case '':
      return 'Ambient';
    default:
      return value ?? 'Ambient';
  }
}

// Status sets that back the typed shared badges — keeps the raw enum from
// leaking and lets us pass the DB string through the typed components safely.
const LISTING_STATUSES: ReadonlyArray<ListingStatus> = [
  'DRAFT',
  'OPEN',
  'MATCHED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
  'EXPIRED',
  'DISPUTED',
];
const OFFER_STATUSES: ReadonlyArray<OfferStatus> = [
  'PENDING',
  'ACCEPTED',
  'REJECTED',
  'EXPIRED',
  'WITHDRAWN',
];

function addressSummary(addr: Record<string, unknown> | null): string {
  if (!addr) return '—';
  const street = (addr.street ?? addr.line1 ?? addr.address) as string | undefined;
  const area = (addr.area ?? addr.neighborhood ?? addr.zone) as string | undefined;
  const notes = (addr.notes ?? addr.note) as string | undefined;
  return [street, area, notes].filter(Boolean).join(' · ') || '—';
}

export default async function FleetMarketplaceListingDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (process.env.HIR_FEATURE_MARKETPLACE_ENABLED !== 'true') notFound();

  const fleet = await requireFleetManager();
  const { id: listingId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(listingId)) notFound();

  const admin = createAdminClient();
  const [{ data: listingData }, { data: myOfferData }] = await Promise.all([
    admin
      .from('marketplace_listings')
      .select(
        'id, status, vertical, delivery_window_start, delivery_window_end, package_description, package_weight_grams, package_temperature, pickup_address, dropoff_address',
      )
      .eq('id', listingId)
      .maybeSingle(),
    // Use maybeSingle since the unique constraint guarantees ≤1 row.
    admin
      .from('marketplace_offers')
      .select(
        'id, offered_price_cents, eta_minutes, status, expires_at, ai_match_score',
      )
      .eq('listing_id', listingId)
      .eq('fleet_id', fleet.fleetId)
      .maybeSingle(),
  ]);

  const listing = listingData as ListingRow | null;
  if (!listing) notFound();

  const myOffer = myOfferData as MyOfferRow | null;
  const alreadyBid = myOffer != null && myOffer.status === 'PENDING';
  // Bid form is only useful while the listing is OPEN. After MATCHED/CANCELLED
  // we hide it; the fleet can still read the listing + see their offer history.
  const canBid = listing.status === 'OPEN';

  // Stream 3 (AI matching) — surface fleet's own composite score next to their
  // bid so the manager knows how their offer ranks vs. competitors. Gated by
  // HIR_FEATURE_AI_MATCHING_ENABLED. NULL score = unscored yet (edge fn hasn't
  // run for this offer).
  const aiMatchingEnabled = process.env.HIR_FEATURE_AI_MATCHING_ENABLED === 'true';
  const myAiScore: number | null =
    myOffer && myOffer.ai_match_score !== null && myOffer.ai_match_score !== undefined
      ? Number(myOffer.ai_match_score)
      : null;

  // Narrow the DB string columns to the typed badge unions; unknown values
  // fall back to a neutral chip rather than leaking the raw enum.
  const listingStatus = LISTING_STATUSES.includes(listing.status as ListingStatus)
    ? (listing.status as ListingStatus)
    : null;
  const myOfferStatus =
    myOffer && OFFER_STATUSES.includes(myOffer.status as OfferStatus)
      ? (myOffer.status as OfferStatus)
      : null;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <PageHeader
        variant="shell"
        title={listing.package_description ?? 'Pachet B2B'}
        breadcrumb={
          <Link
            href="/fleet/marketplace/listings"
            className="inline-flex items-center gap-1 rounded-md font-medium text-hir-muted-fg hover:text-hir-fg"
          >
            <ArrowLeft className="h-3 w-3" strokeWidth={1.75} aria-hidden />
            Toate cererile
          </Link>
        }
        actions={
          <>
            <VerticalBadge vertical={listing.vertical} />
            {listingStatus ? <ListingStatusBadge status={listingStatus} /> : null}
          </>
        }
      />

      {/* Package + window facts. */}
      <Card className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold text-hir-fg">Detalii livrare</h2>

        <RouteSteps
          pickup={addressSummary(listing.pickup_address)}
          dropoff={addressSummary(listing.dropoff_address)}
        />

        <dl className="grid grid-cols-1 gap-3 border-t border-white/5 pt-4 sm:grid-cols-3">
          <Field
            icon={<Package className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />}
            label="Fereastră de livrare"
            value={`${formatTs(listing.delivery_window_start)} → ${formatTs(listing.delivery_window_end)}`}
          />
          <Field
            icon={<Package className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />}
            label="Greutate"
            value={
              listing.package_weight_grams != null
                ? `${(listing.package_weight_grams / 1000).toFixed(2)} kg`
                : '—'
            }
          />
          <Field
            icon={<Thermometer className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />}
            label="Temperatură"
            value={temperatureLabel(listing.package_temperature)}
          />
        </dl>

        <p className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-200/80">
          Datele clientului (nume, telefon complet) se dezvăluie automat la
          acceptarea ofertei de către vendor.
        </p>
      </Card>

      {/* My existing offer panel — only shown when we have one for this
          listing. Lets the manager confirm the live state without bouncing
          to the /offers list. */}
      {myOffer ? (
        <Card className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-hir-fg">Oferta mea</h2>
          <div
            className={`grid gap-3 ${aiMatchingEnabled ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3'}`}
          >
            <Stat label="Preț" value={formatRon(myOffer.offered_price_cents)} />
            <Stat label="ETA" value={`${myOffer.eta_minutes} min`} />
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-hir-muted-fg">
                Status
              </p>
              <div className="mt-1">
                {myOfferStatus ? <OfferStatusBadge status={myOfferStatus} /> : null}
              </div>
            </div>
            {aiMatchingEnabled ? (
              <Stat
                label="Scor AI"
                value={myAiScore === null ? '—' : `${myAiScore.toFixed(0)} / 100`}
              />
            ) : null}
          </div>
          <p className="text-[11px] text-hir-muted-fg">
            Valabilă până la <span className="tabular-nums">{formatTs(myOffer.expires_at)}</span>.
          </p>
          {aiMatchingEnabled ? (
            <p className="text-[11px] text-hir-muted-fg">
              Scorul AI ține cont de preț, ETA, reputația flotei și istoric.
              Mai mare = mai potrivit pentru această cerere.
            </p>
          ) : null}
        </Card>
      ) : null}

      {/* Bid form — gated on listing OPEN. */}
      {canBid ? (
        <BidForm
          listingId={listing.id}
          windowEndIso={listing.delivery_window_end}
          alreadyBid={alreadyBid}
          aiMatchingEnabled={aiMatchingEnabled}
        />
      ) : (
        <EmptyMarketplaceState
          title="Cererea nu mai acceptă oferte."
          description={`Status curent: ${listing.status}.`}
        />
      )}
    </div>
  );
}

function Field({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div>
      <dt className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-hir-muted-fg">
        {icon}
        {label}
      </dt>
      <dd className="mt-1 text-sm tabular-nums text-hir-fg">{value}</dd>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-hir-muted-fg">
        {label}
      </p>
      <p className="mt-0.5 text-sm font-semibold tabular-nums text-hir-fg">{value}</p>
    </div>
  );
}
