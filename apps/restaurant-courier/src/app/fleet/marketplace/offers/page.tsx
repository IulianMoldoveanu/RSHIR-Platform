// B2B Marketplace — fleet's own offers list (Stream 6/9).
// Strategy Master Plan Section 5. Gated by HIR_FEATURE_MARKETPLACE_ENABLED.

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireFleetManager } from '@/lib/fleet-manager';
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

const STATUS_STYLES: Record<OfferWithListing['status'], string> = {
  PENDING: 'bg-sky-500/15 text-sky-300',
  ACCEPTED: 'bg-emerald-500/15 text-emerald-300',
  REJECTED: 'bg-rose-500/15 text-rose-300',
  EXPIRED: 'bg-zinc-500/15 text-zinc-300',
  WITHDRAWN: 'bg-zinc-500/15 text-zinc-300',
};

const STATUS_LABELS: Record<OfferWithListing['status'], string> = {
  PENDING: 'În așteptare',
  ACCEPTED: 'Câștigat',
  REJECTED: 'Respinsă',
  EXPIRED: 'Expirată',
  WITHDRAWN: 'Retrasă',
};

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
        <h1 className="text-xl font-semibold tracking-tight text-hir-fg">Ofertele mele</h1>
        <p className="mt-1 text-sm text-hir-muted-fg">
          {pendingCount} în așteptare · {acceptedCount} câștigate · {offers.length} total
        </p>
      </div>

      {offers.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-hir-border bg-hir-surface p-6 text-center">
          <p className="text-sm text-hir-fg">Nu ai trimis încă nicio ofertă.</p>
          <p className="mt-1 text-xs text-hir-muted-fg">
            Vezi cererile deschise și trimite prima ofertă.
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
          {offers.map((offer) => (
            <li
              key={offer.id}
              className="rounded-2xl border border-hir-border bg-hir-surface p-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${STATUS_STYLES[offer.status]}`}
                    >
                      {STATUS_LABELS[offer.status]}
                    </span>
                    {offer.marketplace_listings?.vertical ? (
                      <span className="rounded-full bg-violet-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-300">
                        {offer.marketplace_listings.vertical}
                      </span>
                    ) : null}
                    <Link
                      href={`/fleet/marketplace/listings/${offer.listing_id}`}
                      className="truncate text-sm font-medium text-hir-fg hover:text-violet-300"
                    >
                      {offer.marketplace_listings?.package_description ?? 'Cerere'}
                    </Link>
                  </div>
                  <p className="mt-1 text-xs text-hir-muted-fg">
                    Preț: <span className="text-hir-fg">{formatRon(offer.offered_price_cents)}</span>
                    {' · '}
                    ETA: <span className="text-hir-fg">{offer.eta_minutes} min</span>
                  </p>
                  <p className="mt-0.5 text-[11px] text-hir-muted-fg">
                    Trimisă: {formatTs(offer.created_at)} · valabilă până la {formatTs(offer.expires_at)}
                  </p>
                </div>
                {offer.status === 'PENDING' ? (
                  <WithdrawButton offerId={offer.id} />
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
