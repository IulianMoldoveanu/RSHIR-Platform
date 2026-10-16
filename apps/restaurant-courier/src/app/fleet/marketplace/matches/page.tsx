// B2B Marketplace — fleet's won bids (matches) list (Stream 6/9).
// Strategy Master Plan Section 5. Gated by HIR_FEATURE_MARKETPLACE_ENABLED.
//
// Matches are the post-MATCH state — vendor accepted our offer. Status moves
// through MATCHED → IN_PROGRESS → DELIVERED (or CANCELLED / DISPUTED /
// REFUNDED). We surface the price + HIR fee so the manager can reconcile
// expected weekly payout.

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireFleetManager } from '@/lib/fleet-manager';
import {
  PageHeader,
  StatCard,
  Card,
  VerticalBadge,
  MatchStatusBadge,
  EmptyMarketplaceState,
  buttonClass,
} from '@/app/_marketplace-ui';

export const dynamic = 'force-dynamic';

type MatchWithListing = {
  id: string;
  listing_id: string;
  matched_at: string;
  status: 'MATCHED' | 'IN_PROGRESS' | 'DELIVERED' | 'CANCELLED' | 'DISPUTED' | 'REFUNDED';
  final_price_cents: number | null;
  hir_fee_cents: number | null;
  courier_order_id: string | null;
  marketplace_listings: {
    vertical: string | null;
    package_description: string | null;
  } | null;
};

function formatRon(cents: number | null): string {
  if (cents == null || !Number.isFinite(cents)) return '—';
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

export default async function FleetMarketplaceMatchesPage() {
  if (process.env.HIR_FEATURE_MARKETPLACE_ENABLED !== 'true') notFound();

  const fleet = await requireFleetManager();
  const admin = createAdminClient();

  // Embed via FK so we don't need a follow-up query for the listing's
  // vertical + description. Last 100 matches covers ~3-4 weeks for a busy
  // pilot fleet.
  const { data: matchesData } = await admin
    .from('marketplace_matches')
    .select(
      'id, listing_id, matched_at, status, final_price_cents, hir_fee_cents, courier_order_id, marketplace_listings(vertical, package_description)',
    )
    .eq('fleet_id', fleet.fleetId)
    .order('matched_at', { ascending: false })
    .limit(100);

  const matches = (matchesData ?? []) as unknown as MatchWithListing[];
  const activeCount = matches.filter((m) =>
    ['MATCHED', 'IN_PROGRESS'].includes(m.status),
  ).length;
  const deliveredCount = matches.filter((m) => m.status === 'DELIVERED').length;
  const grossCents = matches.reduce((s, m) => s + (Number(m.final_price_cents) || 0), 0);
  const feeCents = matches.reduce((s, m) => s + (Number(m.hir_fee_cents) || 0), 0);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <PageHeader
        variant="shell"
        title="Livrări câștigate"
        description={`${activeCount} active · ${deliveredCount} livrate · ${matches.length} total`}
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

      {/* Roll-up tile — gross billed and HIR commission, helps the manager
          sanity-check that the weekly payout calc matches what they see here. */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Total brut (ultimele 100)" value={formatRon(grossCents)} />
        <StatCard label="Comision HIR" value={formatRon(feeCents)} />
      </div>

      {matches.length === 0 ? (
        <EmptyMarketplaceState
          title="Nu ai câștigat încă nicio cerere."
          description="Ofertele acceptate de vendor apar aici."
          action={
            <Link href="/fleet/marketplace/listings" className={buttonClass('primary', 'sm')}>
              Vezi cereri deschise
            </Link>
          }
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {matches.map((match) => (
            <Card key={match.id} as="li">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <MatchStatusBadge status={match.status} />
                  {match.marketplace_listings?.vertical ? (
                    <VerticalBadge vertical={match.marketplace_listings.vertical} />
                  ) : null}
                  <Link
                    href={`/fleet/marketplace/listings/${match.listing_id}`}
                    className="truncate rounded text-sm font-semibold text-hir-fg hover:text-violet-300"
                  >
                    {match.marketplace_listings?.package_description ?? 'Livrare'}
                  </Link>
                </div>
                <p className="mt-2 text-xs text-hir-muted-fg">
                  Preț:{' '}
                  <span className="tabular-nums text-hir-fg">
                    {formatRon(match.final_price_cents)}
                  </span>
                  {' · '}
                  Comision HIR:{' '}
                  <span className="tabular-nums text-hir-fg">{formatRon(match.hir_fee_cents)}</span>
                </p>
                <p className="mt-1 text-[11px] text-hir-muted-fg">
                  Câștigat: <span className="tabular-nums">{formatTs(match.matched_at)}</span>
                  {match.courier_order_id
                    ? ` · cuplat cu comandă curier`
                    : ' · curier neasignat încă'}
                </p>
              </div>
            </Card>
          ))}
        </ul>
      )}
    </div>
  );
}
