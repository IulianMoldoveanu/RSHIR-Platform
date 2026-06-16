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

const LISTING_STATUS_BADGE: Record<ListingStatus, { label: string; cls: string }> = {
  DRAFT: { label: 'Draft', cls: 'bg-zinc-100 text-zinc-700 ring-zinc-200' },
  OPEN: { label: 'Deschis', cls: 'bg-emerald-100 text-emerald-800 ring-emerald-200' },
  MATCHED: { label: 'Atribuit', cls: 'bg-indigo-100 text-indigo-800 ring-indigo-200' },
  IN_PROGRESS: { label: 'În livrare', cls: 'bg-sky-100 text-sky-800 ring-sky-200' },
  COMPLETED: { label: 'Livrat', cls: 'bg-teal-100 text-teal-800 ring-teal-200' },
  CANCELLED: { label: 'Anulat', cls: 'bg-zinc-100 text-zinc-500 ring-zinc-200' },
  EXPIRED: { label: 'Expirat', cls: 'bg-amber-100 text-amber-800 ring-amber-200' },
  DISPUTED: { label: 'Dispută', cls: 'bg-rose-100 text-rose-800 ring-rose-200' },
};

const OFFER_STATUS_BADGE: Record<OfferStatus, { label: string; cls: string }> = {
  PENDING: { label: 'În așteptare', cls: 'bg-amber-100 text-amber-800 ring-amber-200' },
  ACCEPTED: { label: 'Acceptată', cls: 'bg-emerald-100 text-emerald-800 ring-emerald-200' },
  REJECTED: { label: 'Refuzată', cls: 'bg-zinc-100 text-zinc-500 ring-zinc-200' },
  EXPIRED: { label: 'Expirată', cls: 'bg-zinc-100 text-zinc-500 ring-zinc-200' },
  WITHDRAWN: { label: 'Retrasă', cls: 'bg-zinc-100 text-zinc-500 ring-zinc-200' },
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

function centsToRon(cents: number): string {
  return (cents / 100).toLocaleString('ro-RO', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
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

  const listingBadge = LISTING_STATUS_BADGE[listing.status];
  const isOpen = listing.status === 'OPEN';
  const isCancellable = listing.status === 'DRAFT' || listing.status === 'OPEN';

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6 md:px-8 md:py-10">
      <nav className="mb-4 text-sm text-zinc-500">
        <Link href="/marketplace/listings" className="hover:text-zinc-900">
          ← Înapoi la cereri
        </Link>
      </nav>

      <header className="mb-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">
            Cerere #{listing.id.slice(0, 8)}
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            {listing.tenants?.name ?? '—'} · {listing.cities?.name ?? 'fără oraș'} ·{' '}
            <span className="capitalize">{listing.vertical}</span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ${listingBadge.cls}`}
          >
            {listingBadge.label}
          </span>
          {isCancellable ? <CancelButton listingId={listing.id} /> : null}
        </div>
      </header>

      {/* ── Listing summary card ─────────────────────────────────── */}
      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-zinc-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold text-zinc-900">Interval livrare</h2>
          <dl className="space-y-2 text-sm">
            <div>
              <dt className="text-xs uppercase tracking-wide text-zinc-500">Început</dt>
              <dd className="tabular-nums text-zinc-900">
                {fmtDateTime(listing.delivery_window_start)}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-zinc-500">Sfârșit</dt>
              <dd className="tabular-nums text-zinc-900">
                {fmtDateTime(listing.delivery_window_end)}
              </dd>
            </div>
          </dl>
        </div>

        <div className="rounded-lg border border-zinc-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold text-zinc-900">Pachet</h2>
          <dl className="space-y-2 text-sm">
            <div>
              <dt className="text-xs uppercase tracking-wide text-zinc-500">Descriere</dt>
              <dd className="text-zinc-900">{listing.package_description ?? '—'}</dd>
            </div>
            <div className="flex gap-6">
              <div>
                <dt className="text-xs uppercase tracking-wide text-zinc-500">Greutate</dt>
                <dd className="tabular-nums text-zinc-900">
                  {listing.package_weight_grams === null
                    ? '—'
                    : `${listing.package_weight_grams.toLocaleString('ro-RO')} g`}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-zinc-500">Temperatură</dt>
                <dd className="text-zinc-900">{listing.package_temperature ?? '—'}</dd>
              </div>
            </div>
          </dl>
        </div>

        <div className="rounded-lg border border-zinc-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold text-zinc-900">Ridicare</h2>
          <p className="text-sm text-zinc-900">{summarizeAddress(listing.pickup_address)}</p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold text-zinc-900">Livrare</h2>
          <p className="text-sm text-zinc-900">{summarizeAddress(listing.dropoff_address)}</p>
          {listing.customer_phone_redacted ? (
            <p className="mt-2 text-xs text-zinc-500">
              Telefon client (redactat): {listing.customer_phone_redacted}
            </p>
          ) : null}
        </div>
      </section>

      {/* ── Offers ───────────────────────────────────────────────── */}
      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold text-zinc-900">
          Oferte primite ({offers.length})
        </h2>

        {offersErr ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            Eroare la încărcarea ofertelor: {offersErr.message}
          </div>
        ) : offers.length === 0 ? (
          <div className="rounded-lg border border-dashed border-zinc-300 bg-white px-6 py-10 text-center">
            <p className="text-sm text-zinc-500">
              {isOpen
                ? 'Nu există oferte încă. Cererea este publicată — flotele HIR vor răspunde în curând.'
                : 'Nicio ofertă înregistrată pentru această cerere.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white shadow-sm">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
                  <th className="px-4 py-3 text-left font-medium">Flotă</th>
                  {aiMatchingEnabled ? (
                    <th
                      className="px-4 py-3 text-right font-medium"
                      title="Scor compus AI (0..100, mai mare = mai potrivit). Sortat descrescător."
                    >
                      AI
                    </th>
                  ) : null}
                  <th className="px-4 py-3 text-right font-medium">Preț</th>
                  <th className="px-4 py-3 text-right font-medium">ETA</th>
                  <th className="px-4 py-3 text-right font-medium">Rating</th>
                  <th className="px-4 py-3 text-left font-medium">Expiră</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                  <th className="px-4 py-3 text-right font-medium">Acțiune</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {offers.map((o) => {
                  const badge = OFFER_STATUS_BADGE[o.status];
                  return (
                    <tr key={o.id} className="hover:bg-zinc-50">
                      <td className="px-4 py-3 font-medium text-zinc-900">
                        {o.fleet_name ?? `Flotă ${o.fleet_id.slice(0, 8)}`}
                        {o.notes ? (
                          <div className="mt-0.5 text-xs text-zinc-500">{o.notes}</div>
                        ) : null}
                      </td>
                      {aiMatchingEnabled ? (
                        <td className="px-4 py-3 text-right">
                          <AiMatchScoreBadge score={o.ai_match_score} />
                        </td>
                      ) : null}
                      <td className="px-4 py-3 text-right tabular-nums font-medium text-zinc-900">
                        {centsToRon(o.offered_price_cents)} RON
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-zinc-700">
                        {o.eta_minutes} min
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-zinc-700">
                        {o.fleet_rating === null ? '—' : o.fleet_rating.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-zinc-700">{fmtDateTime(o.expires_at)}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${badge.cls}`}
                        >
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {isOpen && o.status === 'PENDING' ? (
                          <OfferActions offerId={o.id} listingId={listing.id} />
                        ) : (
                          <span className="text-xs text-zinc-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
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
