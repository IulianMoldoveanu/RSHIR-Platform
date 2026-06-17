// B2B Marketplace — vendor listing detail.
//
// Strategy Master Plan Section 5 (B2B Marketplace), Stream 5/9 (UI vendor side).
// Shows one listing's metadata, the offers placed on it, and gives the vendor
// the two terminal actions: cancel (DRAFT/OPEN only) or accept one PENDING
// offer (atomic via marketplace-match-accept edge fn).
//
// Membership is verified at fetch time — the row is loaded via service_role
// and we 404 if the listing's vendor_tenant_id isn't one of the user's
// tenant_members rows.

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClientUntyped } from '@/lib/supabase/admin';
import { OfferActions } from './offer-actions';
import { CancelButtonClient } from './cancel-button';
import {
  PageHeader,
  Card,
  Icon,
  VerticalBadge,
  RouteSteps,
  ETAPill,
  PriceCellRON,
  ListingStatusBadge,
  OfferStatusBadge,
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

type OfferStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED' | 'WITHDRAWN';

type Offer = {
  id: string;
  fleet_id: string;
  fleet_name: string | null;
  offered_price_cents: number;
  eta_minutes: number;
  fleet_rating: number | null;
  notes: string | null;
  status: OfferStatus;
  expires_at: string;
  created_at: string;
  // Stream 3 (AI matching) — 0..100 cached composite score from
  // ai-marketplace-match-score edge fn. NULL until the offer has been scored.
  ai_match_score: number | null;
};

// Package temperature enum → ro-RO label (mirrors the new-listing form options).
const TEMPERATURE_LABEL: Record<string, string> = {
  ambient: 'Ambient',
  chilled: 'Refrigerat',
  frozen: 'Congelat',
};

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '—';
  return d.toLocaleString('ro-RO', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function summarizeAddress(addr: unknown): string {
  if (!addr || typeof addr !== 'object') return '—';
  const a = addr as Record<string, unknown>;
  const parts: string[] = [];
  if (typeof a.street === 'string') parts.push(a.street);
  if (typeof a.number === 'string') parts.push(a.number);
  if (typeof a.city === 'string') parts.push(a.city);
  const head = parts.filter(Boolean).join(' ');
  const notes = typeof a.notes === 'string' && a.notes.length > 0 ? ` (${a.notes})` : '';
  return (head || '—') + notes;
}

export default async function ListingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<JSX.Element> {
  if (process.env.HIR_FEATURE_MARKETPLACE_ENABLED !== 'true') notFound();

  const { id: listingId } = await params;
  if (typeof listingId !== 'string' || listingId.length === 0) notFound();

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClientUntyped();

  // 1. Load listing + embedded city + offers (+ fleet name).
  const { data: rawListing, error: listingErr } = await admin
    .from('marketplace_listings')
    .select(
      [
        'id',
        'vendor_tenant_id',
        'vertical',
        'status',
        'delivery_window_start',
        'delivery_window_end',
        'pickup_address',
        'dropoff_address',
        'package_description',
        'package_weight_grams',
        'package_temperature',
        'customer_phone_redacted',
        'created_at',
        'cities:cities(name)',
        'tenants:tenants(id, name)',
      ].join(', '),
    )
    .eq('id', listingId)
    .maybeSingle();

  if (listingErr || !rawListing) notFound();

  const listing = rawListing as {
    id: string;
    vendor_tenant_id: string;
    vertical: string;
    status: ListingStatus;
    delivery_window_start: string;
    delivery_window_end: string;
    pickup_address: unknown;
    dropoff_address: unknown;
    package_description: string | null;
    package_weight_grams: number | null;
    package_temperature: string | null;
    customer_phone_redacted: string | null;
    created_at: string;
    cities: { name: string } | null;
    tenants: { id: string; name: string } | null;
  };

  // 2. Verify membership — 404 (not 403) so we don't leak listing existence.
  const { data: member } = await admin
    .from('tenant_members')
    .select('tenant_id')
    .eq('user_id', user.id)
    .eq('tenant_id', listing.vendor_tenant_id)
    .maybeSingle();
  if (!member) notFound();

  // 3. Load offers placed on this listing.
  //
  // Stream 3 (AI matching) — we additionally select ai_match_score (numeric,
  // nullable) from migration 20260616_015. When HIR_FEATURE_AI_MATCHING_ENABLED
  // is on we sort by score DESC (NULLS LAST) so the highest-ranked fleet shows
  // first; otherwise we keep the original "cheapest first" ordering.
  const aiMatchingEnabled = process.env.HIR_FEATURE_AI_MATCHING_ENABLED === 'true';

  let offersQuery = admin
    .from('marketplace_offers')
    .select(
      [
        'id',
        'fleet_id',
        'offered_price_cents',
        'eta_minutes',
        'fleet_rating',
        'notes',
        'status',
        'expires_at',
        'created_at',
        'ai_match_score',
        'courier_fleets:courier_fleets(name)',
      ].join(', '),
    )
    .eq('listing_id', listingId);

  offersQuery = aiMatchingEnabled
    ? offersQuery
        .order('ai_match_score', { ascending: false, nullsFirst: false })
        .order('offered_price_cents', { ascending: true })
    : offersQuery.order('offered_price_cents', { ascending: true });

  const { data: rawOffers, error: offersErr } = await offersQuery;

  const offers: Offer[] = (rawOffers ?? []).map(
    (o: {
      id: string;
      fleet_id: string;
      offered_price_cents: number;
      eta_minutes: number;
      fleet_rating: number | null;
      notes: string | null;
      status: OfferStatus;
      expires_at: string;
      created_at: string;
      ai_match_score: number | string | null;
      courier_fleets: { name: string } | null;
    }) => ({
      id: o.id,
      fleet_id: o.fleet_id,
      fleet_name: o.courier_fleets?.name ?? null,
      offered_price_cents: Number(o.offered_price_cents),
      eta_minutes: Number(o.eta_minutes),
      fleet_rating: o.fleet_rating === null ? null : Number(o.fleet_rating),
      notes: o.notes,
      status: o.status,
      expires_at: o.expires_at,
      created_at: o.created_at,
      ai_match_score:
        o.ai_match_score === null || o.ai_match_score === undefined
          ? null
          : Number(o.ai_match_score),
    }),
  );

  const isOpen = listing.status === 'OPEN';
  const isCancellable = listing.status === 'DRAFT' || listing.status === 'OPEN';
  const temperatureLabel =
    listing.package_temperature === null
      ? '—'
      : TEMPERATURE_LABEL[listing.package_temperature] ?? listing.package_temperature;

  // Status-aware summary derived from the ACCEPTED offer already in `offers`
  // (no new query). Shown once the listing has been matched onward.
  const acceptedOffer = offers.find((o) => o.status === 'ACCEPTED') ?? null;
  const showSummary =
    acceptedOffer !== null &&
    (listing.status === 'MATCHED' ||
      listing.status === 'IN_PROGRESS' ||
      listing.status === 'COMPLETED');

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6 md:px-8 md:py-10">
      <PageHeader
        variant="shell"
        breadcrumb={
          <Link
            href="/marketplace/listings"
            className="inline-flex items-center gap-1 hover:underline"
          >
            <Icon name="arrow-left" className="h-3.5 w-3.5" />
            Înapoi la cereri
          </Link>
        }
        title={`Cerere #${listing.id.slice(0, 8)}`}
        description={`${listing.tenants?.name ?? '—'} · ${listing.cities?.name ?? 'fără oraș'}`}
        actions={
          <div className="flex items-center gap-3">
            <VerticalBadge vertical={listing.vertical} />
            <ListingStatusBadge status={listing.status} />
            {isCancellable ? <CancelButton listingId={listing.id} /> : null}
          </div>
        }
      />

      {showSummary && acceptedOffer ? (
        <Card accent className="mt-6 border-emerald-200 bg-emerald-50/40">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 text-emerald-600">
              <Icon name="check-circle" className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-[#23093a]">Ofertă acceptată</h2>
              <p className="mt-1 text-sm text-slate-600">
                Flotă câștigătoare:{' '}
                <span className="font-semibold text-slate-900">
                  {acceptedOffer.fleet_name ?? `Flotă ${acceptedOffer.fleet_id.slice(0, 8)}`}
                </span>
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
                <span className="text-slate-600">
                  Preț final:{' '}
                  <PriceCellRON
                    cents={acceptedOffer.offered_price_cents}
                    className="font-semibold text-[#6b1f8a]"
                  />
                </span>
                <span className="text-xs text-slate-500">+1 RON taxă HIR</span>
              </div>
            </div>
          </div>
        </Card>
      ) : null}

      {/* ── Listing summary cards ─────────────────────────────────── */}
      <section className="mt-6 grid gap-4 md:grid-cols-2">
        <Card>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-[#23093a]">
            <Icon name="clock" className="text-[#6b1f8a]" />
            Interval livrare
          </h2>
          <ETAPill
            startIso={listing.delivery_window_start}
            endIso={listing.delivery_window_end}
          />
        </Card>

        <Card>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-[#23093a]">
            <Icon name="package" className="text-[#6b1f8a]" />
            Pachet
          </h2>
          <dl className="space-y-2 text-sm">
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Descriere
              </dt>
              <dd className="text-slate-700">{listing.package_description ?? '—'}</dd>
            </div>
            <div className="flex gap-6">
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Greutate
                </dt>
                <dd className="tabular-nums text-slate-700">
                  {listing.package_weight_grams === null
                    ? '—'
                    : `${listing.package_weight_grams.toLocaleString('ro-RO')} g`}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Temperatură
                </dt>
                <dd className="text-slate-700">{temperatureLabel}</dd>
              </div>
            </div>
          </dl>
        </Card>

        <Card className="md:col-span-2">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-bold text-[#23093a]">
            <Icon name="map-pin" className="text-[#6b1f8a]" />
            Traseu
          </h2>
          <RouteSteps
            pickup={summarizeAddress(listing.pickup_address)}
            dropoff={summarizeAddress(listing.dropoff_address)}
            redactedPhone={
              listing.customer_phone_redacted
                ? `Telefon client (redactat): ${listing.customer_phone_redacted}`
                : null
            }
          />
        </Card>
      </section>

      {/* ── Offers ───────────────────────────────────────────────── */}
      <section className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-bold text-[#23093a]">
            <Icon name="gavel" className="text-[#6b1f8a]" />
            Oferte primite ({offers.length})
          </h2>
          {isOpen && offers.some((o) => o.status === 'PENDING') ? (
            <span className="text-xs text-slate-500">
              Acceptarea unei oferte le respinge pe celelalte.
            </span>
          ) : null}
        </div>

        {offersErr ? (
          <ErrorState description="Nu am putut încărca ofertele. Reîncarcă pagina sau revino mai târziu." />
        ) : offers.length === 0 ? (
          <EmptyMarketplaceState
            title={isOpen ? 'Nicio ofertă încă' : 'Nicio ofertă'}
            description={
              isOpen
                ? 'Cererea este publicată — flotele HIR vor răspunde în curând.'
                : 'Nicio ofertă înregistrată pentru această cerere.'
            }
          />
        ) : (
          <ul className="grid list-none gap-3">
            {offers.map((o, idx) => {
              const isRecommended = idx === 0 && o.status === 'PENDING';
              return (
                <li
                  key={o.id}
                  className={
                    isRecommended
                      ? 'relative rounded-2xl border border-[#e9d5f0] bg-white p-4 shadow-sm ring-2 ring-[#6b1f8a]/40'
                      : 'relative rounded-2xl border border-slate-200 bg-white p-4 shadow-sm'
                  }
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        {isRecommended ? (
                          <span
                            className="inline-flex items-center gap-1 rounded-full bg-[#f7f0fb] px-2 py-0.5 text-[11px] font-semibold text-[#6b1f8a] ring-1 ring-inset ring-[#e9d5f0]"
                            title="Cea mai bună ofertă"
                          >
                            <Icon name="trophy" className="h-3.5 w-3.5" />
                            Recomandat
                          </span>
                        ) : null}
                        <span className="font-semibold text-slate-900">
                          {o.fleet_name ?? `Flotă ${o.fleet_id.slice(0, 8)}`}
                        </span>
                        {aiMatchingEnabled ? (
                          <AiMatchScoreBadge score={o.ai_match_score} />
                        ) : null}
                      </div>
                      {o.notes ? (
                        <p className="mt-1 text-xs text-slate-500">{o.notes}</p>
                      ) : null}
                      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-600">
                        <span className="inline-flex items-center gap-1.5">
                          <Icon name="clock" className="h-3.5 w-3.5 text-slate-400" />
                          <span className="tabular-nums">{o.eta_minutes} min</span>
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <Icon name="star" className="h-3.5 w-3.5 text-amber-400" />
                          <span className="tabular-nums">
                            {o.fleet_rating === null ? '—' : o.fleet_rating.toFixed(2)}
                          </span>
                        </span>
                        <span className="inline-flex items-center gap-1.5 text-slate-500">
                          Expiră:{' '}
                          <span className="tabular-nums">{fmtDateTime(o.expires_at)}</span>
                        </span>
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-col items-start gap-2 md:items-end">
                      <div className="text-right">
                        <PriceCellRON
                          cents={o.offered_price_cents}
                          className="text-lg font-bold text-[#6b1f8a]"
                        />
                        <p className="text-[11px] text-slate-400">+1 RON taxă HIR</p>
                      </div>
                      <OfferStatusBadge status={o.status} />
                      {isOpen && o.status === 'PENDING' ? (
                        <OfferActions offerId={o.id} listingId={listing.id} />
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}

// Server-side wrapper around the client CancelButton so the JSX above stays
// readable (a client component used inside a server component is the standard
// Next.js boundary).
function CancelButton({ listingId }: { listingId: string }): JSX.Element {
  return <CancelButtonClient listingId={listingId} />;
}

// AI Match Score badge (Stream 3) — mov gradient pill rendering the cached
// 0..100 composite score from ai-marketplace-match-score. Score is NULL until
// the edge fn has been called for this offer; we show a neutral dash so the
// vendor knows the row is unscored (versus a real 0).
function AiMatchScoreBadge({ score }: { score: number | null }): JSX.Element {
  if (score === null || !Number.isFinite(score)) {
    return <span className="text-xs text-zinc-400">—</span>;
  }
  const clamped = Math.max(0, Math.min(100, score));
  return (
    <span
      className="inline-flex min-w-[2.5rem] items-center justify-center rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-500 px-2 py-0.5 text-xs font-semibold tabular-nums text-white shadow-sm"
      title={`Scor AI ${clamped.toFixed(1)} / 100 — compus din preț, ETA, reputație și istoric.`}
    >
      {clamped.toFixed(0)}
    </span>
  );
}
