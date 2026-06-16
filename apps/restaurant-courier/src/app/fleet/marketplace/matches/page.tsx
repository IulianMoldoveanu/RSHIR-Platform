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

const STATUS_STYLES: Record<MatchWithListing['status'], string> = {
  MATCHED: 'bg-sky-500/15 text-sky-300',
  IN_PROGRESS: 'bg-violet-500/15 text-violet-300',
  DELIVERED: 'bg-emerald-500/15 text-emerald-300',
  CANCELLED: 'bg-zinc-500/15 text-zinc-300',
  DISPUTED: 'bg-amber-500/15 text-amber-300',
  REFUNDED: 'bg-rose-500/15 text-rose-300',
};

const STATUS_LABELS: Record<MatchWithListing['status'], string> = {
  MATCHED: 'Câștigat',
  IN_PROGRESS: 'În curs',
  DELIVERED: 'Livrat',
  CANCELLED: 'Anulat',
  DISPUTED: 'Disputat',
  REFUNDED: 'Rambursat',
};

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
      <div className="flex items-center gap-2">
        <Link
          href="/fleet/marketplace"
          className="inline-flex items-center gap-1 text-xs font-medium text-hir-muted-fg hover:text-hir-fg"
        >
          <ArrowLeft className="h-3 w-3" aria-hidden />
          Marketplace
        </Link>
      </div>

      <div>
        <h1 className="text-xl font-semibold tracking-tight text-hir-fg">Livrări câștigate</h1>
        <p className="mt-1 text-sm text-hir-muted-fg">
          {activeCount} active · {deliveredCount} livrate · {matches.length} total
        </p>
      </div>

      {/* Roll-up tile — gross billed and HIR commission, helps the manager
          sanity-check that the weekly payout calc matches what they see here. */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-hir-border bg-hir-surface p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-hir-muted-fg">
            Total brut (ultimele 100)
          </p>
          <p className="mt-1 text-xl font-semibold text-hir-fg">{formatRon(grossCents)}</p>
        </div>
        <div className="rounded-2xl border border-hir-border bg-hir-surface p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-hir-muted-fg">
            Comision HIR
          </p>
          <p className="mt-1 text-xl font-semibold text-hir-fg">{formatRon(feeCents)}</p>
        </div>
      </div>

      {matches.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-hir-border bg-hir-surface p-6 text-center">
          <p className="text-sm text-hir-fg">Nu ai câștigat încă nicio cerere.</p>
          <p className="mt-1 text-xs text-hir-muted-fg">
            Ofertele acceptate de vendor apar aici.
          </p>
          <Link
            href="/fleet/marketplace/listings"
            className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-violet-500 px-3 py-2 text-xs font-semibold text-white hover:bg-violet-400"
          >
            Vezi cereri deschise
          </Link>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {matches.map((match) => (
            <li
              key={match.id}
              className="rounded-2xl border border-hir-border bg-hir-surface p-3"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${STATUS_STYLES[match.status]}`}
                  >
                    {STATUS_LABELS[match.status]}
                  </span>
                  {match.marketplace_listings?.vertical ? (
                    <span className="rounded-full bg-violet-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-300">
                      {match.marketplace_listings.vertical}
                    </span>
                  ) : null}
                  <Link
                    href={`/fleet/marketplace/listings/${match.listing_id}`}
                    className="truncate text-sm font-medium text-hir-fg hover:text-violet-300"
                  >
                    {match.marketplace_listings?.package_description ?? 'Livrare'}
                  </Link>
                </div>
                <p className="mt-1 text-xs text-hir-muted-fg">
                  Preț: <span className="text-hir-fg">{formatRon(match.final_price_cents)}</span>
                  {' · '}
                  Comision HIR: <span className="text-hir-fg">{formatRon(match.hir_fee_cents)}</span>
                </p>
                <p className="mt-0.5 text-[11px] text-hir-muted-fg">
                  Câștigat: {formatTs(match.matched_at)}
                  {match.courier_order_id
                    ? ` · cuplat cu comandă curier`
                    : ' · curier neasignat încă'}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
