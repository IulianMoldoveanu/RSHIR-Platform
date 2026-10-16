// B2B Marketplace — fleet's own offers list (Stream 6/9).
// Strategy Master Plan Section 5. Gated by HIR_FEATURE_MARKETPLACE_ENABLED.

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireFleetManager } from '@/lib/fleet-manager';
import {
  PageHeader,
  Card,
  VerticalBadge,
  OfferStatusBadge,
  EmptyMarketplaceState,
  buttonClass,
} from '@/app/_marketplace-ui';
import { WithdrawButton } from './_withdraw-button';

export const dynamic = 'force-dynamic';

type OfferWithListing = {
  id: string;
  listing_id: string;
  offered_price_cents: number;
  eta_minutes: number;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED' | 'WITHDRAWN';
  expires_at: string;
  created_at: string;
  // Joined columns: PostgREST returns a nested object for FK joins.
  marketplace_listings: {
    vertical: string | null;
    package_description: string | null;
    status: string | null;
  } | null;
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

export default async function FleetMarketplaceOffersPage() {
  if (process.env.HIR_FEATURE_MARKETPLACE_ENABLED !== 'true') notFound();

  const fleet = await requireFleetManager();
  const admin = createAdminClient();

  // PostgREST embed via FK — marketplace_offers.listing_id REFERENCES
  // marketplace_listings(id), so this resolves to a nested object per row.
  // Last 100 offers is plenty for a fleet's working memory.
  const { data: offersData } = await admin
    .from('marketplace_offers')
    .select(
      'id, listing_id, offered_price_cents, eta_minutes, status, expires_at, created_at, marketplace_listings(vertical, package_description, status)',
    )
    .eq('fleet_id', fleet.fleetId)
    .order('created_at', { ascending: false })
    .limit(100);

  const offers = (offersData ?? []) as unknown as OfferWithListing[];
  const pendingCount = offers.filter((o) => o.status === 'PENDING').length;
  const acceptedCount = offers.filter((o) => o.status === 'ACCEPTED').length;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <PageHeader
        variant="shell"
        title="Ofertele mele"
        description={`${pendingCount} în așteptare · ${acceptedCount} câștigate · ${offers.length} total`}
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

      {offers.length === 0 ? (
        <EmptyMarketplaceState
          title="Nu ai trimis încă nicio ofertă."
          description="Vezi cererile deschise și trimite prima ofertă."
          action={
            <Link href="/fleet/marketplace/listings" className={buttonClass('primary', 'sm')}>
              Vezi cereri deschise
            </Link>
          }
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {offers.map((offer) => (
            <Card key={offer.id} as="li">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <OfferStatusBadge status={offer.status} />
                    {offer.marketplace_listings?.vertical ? (
                      <VerticalBadge vertical={offer.marketplace_listings.vertical} />
                    ) : null}
                    <Link
                      href={`/fleet/marketplace/listings/${offer.listing_id}`}
                      className="truncate rounded text-sm font-semibold text-hir-fg hover:text-violet-300"
                    >
                      {offer.marketplace_listings?.package_description ?? 'Cerere'}
                    </Link>
                  </div>
                  <p className="mt-2 text-xs text-hir-muted-fg">
                    Preț:{' '}
                    <span className="tabular-nums text-hir-fg">
                      {formatRon(offer.offered_price_cents)}
                    </span>
                    {' · '}
                    ETA:{' '}
                    <span className="tabular-nums text-hir-fg">{offer.eta_minutes} min</span>
                  </p>
                  <p className="mt-1 text-[11px] text-hir-muted-fg">
                    Trimisă:{' '}
                    <span className="tabular-nums">{formatTs(offer.created_at)}</span> · valabilă
                    până la <span className="tabular-nums">{formatTs(offer.expires_at)}</span>
                  </p>
                </div>
                {offer.status === 'PENDING' ? (
                  <WithdrawButton offerId={offer.id} />
                ) : null}
              </div>
            </Card>
          ))}
        </ul>
      )}
    </div>
  );
}
