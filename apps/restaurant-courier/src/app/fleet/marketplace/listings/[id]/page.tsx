// B2B Marketplace — fleet-side listing detail + bid form (Stream 6/9).
// Strategy Master Plan Section 5. Gated by HIR_FEATURE_MARKETPLACE_ENABLED.
//
// Shows the listing's package, pickup zone, delivery window, and the fleet's
// own existing offer (if any). Below: the bid form (client island).

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, MapPin, Package, Thermometer } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireFleetManager } from '@/lib/fleet-manager';
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
      .select('id, offered_price_cents, eta_minutes, status, expires_at')
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

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <div className="flex items-center gap-2">
        <Link
          href="/fleet/marketplace/listings"
          className="inline-flex items-center gap-1 text-xs font-medium text-hir-muted-fg hover:text-hir-fg"
        >
          <ArrowLeft className="h-3 w-3" aria-hidden />
          Toate cererile
        </Link>
      </div>

      <div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-violet-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-300">
            {listing.vertical}
          </span>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
              listing.status === 'OPEN'
                ? 'bg-emerald-500/15 text-emerald-300'
                : 'bg-zinc-500/15 text-zinc-300'
            }`}
          >
            {listing.status}
          </span>
        </div>
        <h1 className="mt-2 text-xl font-semibold tracking-tight text-hir-fg">
          {listing.package_description ?? 'Pachet B2B'}
        </h1>
      </div>

      {/* Package + window facts. */}
      <section className="rounded-2xl border border-hir-border bg-hir-surface p-4">
        <h2 className="mb-3 text-sm font-semibold text-hir-fg">Detalii livrare</h2>
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field
            icon={<Package className="h-3.5 w-3.5" aria-hidden />}
            label="Fereastră de livrare"
            value={`${formatTs(listing.delivery_window_start)} → ${formatTs(listing.delivery_window_end)}`}
          />
          <Field
            icon={<Package className="h-3.5 w-3.5" aria-hidden />}
            label="Greutate"
            value={
              listing.package_weight_grams != null
                ? `${(listing.package_weight_grams / 1000).toFixed(2)} kg`
                : '—'
            }
          />
          <Field
            icon={<Thermometer className="h-3.5 w-3.5" aria-hidden />}
            label="Temperatură"
            value={listing.package_temperature ?? 'ambient'}
          />
          <Field
            icon={<MapPin className="h-3.5 w-3.5" aria-hidden />}
            label="Ridicare"
            value={addressSummary(listing.pickup_address)}
          />
          <Field
            icon={<MapPin className="h-3.5 w-3.5" aria-hidden />}
            label="Livrare"
            value={addressSummary(listing.dropoff_address)}
          />
        </dl>
        <p className="mt-3 rounded-md bg-amber-500/5 px-3 py-2 text-[11px] text-amber-200/80">
          Datele clientului (nume, telefon complet) se dezvăluie automat la
          acceptarea ofertei de către vendor.
        </p>
      </section>

      {/* My existing offer panel — only shown when we have one for this
          listing. Lets the manager confirm the live state without bouncing
          to the /offers list. */}
      {myOffer ? (
        <section className="rounded-2xl border border-hir-border bg-hir-surface p-4">
          <h2 className="mb-3 text-sm font-semibold text-hir-fg">Oferta mea</h2>
          <div className="grid grid-cols-3 gap-3 text-xs">
            <Stat label="Preț" value={formatRon(myOffer.offered_price_cents)} />
            <Stat label="ETA" value={`${myOffer.eta_minutes} min`} />
            <Stat label="Status" value={myOffer.status} />
          </div>
          <p className="mt-2 text-[11px] text-hir-muted-fg">
            Valabilă până la {formatTs(myOffer.expires_at)}.
          </p>
        </section>
      ) : null}

      {/* Bid form — gated on listing OPEN. */}
      {canBid ? (
        <BidForm
          listingId={listing.id}
          windowEndIso={listing.delivery_window_end}
          alreadyBid={alreadyBid}
        />
      ) : (
        <section className="rounded-2xl border border-dashed border-hir-border bg-hir-surface p-4 text-center text-xs text-hir-muted-fg">
          Această cerere nu mai acceptă oferte (status: {listing.status}).
        </section>
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
      <dd className="mt-1 text-sm text-hir-fg">{value}</dd>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-hir-muted-fg">
        {label}
      </p>
      <p className="mt-0.5 text-sm font-semibold text-hir-fg">{value}</p>
    </div>
  );
}
