// /pfa-dashboard — Solo PFA self-serve dashboard (Stream UI-1).
//
// Two modes:
//   - VERIFIED_PFA_LIGHT       → full dashboard with open marketplace listings
//                                scoped to this PFA's own micro-fleet
//   - PENDING / no PFA fleet   → status card (verification pending or
//                                user hasn't completed /pfa-signup yet)
//
// Marketplace preview mirrors /fleet/marketplace but auto-scopes to this
// PFA's fleet_id without needing fleet-manager context (the PFA owns the
// fleet, so we resolve courier_fleets where pfa_owner_user_id = caller).
//
// Feature flag NEXT_PUBLIC_HIR_FEATURE_SOLO_PFA_ENABLED gates the route.

import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowRight,
  Banknote,
  CheckCircle2,
  Clock,
  FileSearch,
  Gavel,
  MapPin,
  Package,
  ShieldCheck,
} from 'lucide-react';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Panou PFA — HIR Curier',
  robots: 'noindex,nofollow',
};

type FleetRow = {
  id: string;
  name: string;
  is_active: boolean;
  pfa_cui: string | null;
  primary_city_id: string | null;
};

type KyfRow = {
  kyf_status: 'PENDING' | 'VERIFIED' | 'REJECTED' | 'VERIFIED_PFA_LIGHT';
  company_name: string | null;
  anaf_active: boolean | null;
  verified_at: string | null;
  rejected_reason: string | null;
  submitted_at: string | null;
};

type ListingPreview = {
  id: string;
  city_id: string | null;
  vertical: string;
  delivery_window_start: string;
  delivery_window_end: string;
  package_description: string | null;
  package_weight_grams: number | null;
  pickup_address: Record<string, unknown> | null;
};

type OfferRow = {
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED' | 'WITHDRAWN';
};

type MatchRow = {
  status: 'MATCHED' | 'IN_PROGRESS' | 'DELIVERED' | 'CANCELLED' | 'DISPUTED' | 'REFUNDED';
  hir_fee_cents: number | null;
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

function pickupSummary(addr: Record<string, unknown> | null): string {
  if (!addr) return '—';
  const street = (addr.street ?? addr.line1 ?? addr.address) as string | undefined;
  const area = (addr.area ?? addr.neighborhood ?? addr.zone) as string | undefined;
  return [street, area].filter(Boolean).join(' · ') || '—';
}

export default async function PfaDashboardPage() {
  if (process.env.NEXT_PUBLIC_HIR_FEATURE_SOLO_PFA_ENABLED !== 'true') {
    notFound();
  }

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/pfa-dashboard');

  const admin = createAdminClient();

  // ── Find this user's solo PFA fleet ──────────────────────────────────
  // Use pfa_owner_user_id (denormalized) + is_pfa_solo flag — both set by
  // the pfa-onboarding-light edge fn at signup.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: fleetData } = await (admin as any)
    .from('courier_fleets')
    .select('id, name, is_active, pfa_cui, primary_city_id')
    .eq('pfa_owner_user_id', user.id)
    .eq('is_pfa_solo', true)
    .maybeSingle();
  const fleet = (fleetData as FleetRow | null) ?? null;

  // ── No PFA fleet yet → CTA to /pfa-signup ────────────────────────────
  if (!fleet) {
    return (
      <main className="min-h-screen bg-hir-bg px-4 py-8 text-hir-fg">
        <div className="mx-auto flex w-full max-w-md flex-col gap-6">
          <header className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-violet-500/15 ring-1 ring-violet-500/30 shadow-md shadow-violet-500/15">
              <ShieldCheck className="h-5 w-5 text-violet-300" aria-hidden strokeWidth={2.25} />
            </span>
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-hir-fg">
                Panou PFA
              </h1>
              <p className="mt-1 text-sm leading-relaxed text-hir-muted-fg">
                Nu ai încă un cont PFA înregistrat. Înrolează-te în 3 pași.
              </p>
            </div>
          </header>
          <Link
            href="/pfa-signup"
            className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-violet-500 px-5 text-sm font-semibold text-white hover:bg-violet-400 active:bg-violet-600 focus-visible:outline-2 focus-visible:outline-violet-400 focus-visible:outline-offset-2"
          >
            Începe înregistrarea PFA
            <ArrowRight className="ml-1.5 h-4 w-4" aria-hidden />
          </Link>
        </div>
      </main>
    );
  }

  // ── Read KYF row to know the verification state ──────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: kyfData } = await (admin as any)
    .from('fleet_kyf')
    .select('kyf_status, company_name, anaf_active, verified_at, rejected_reason, submitted_at')
    .eq('fleet_id', fleet.id)
    .maybeSingle();
  const kyf = (kyfData as KyfRow | null) ?? null;

  const isVerified =
    kyf?.kyf_status === 'VERIFIED' || kyf?.kyf_status === 'VERIFIED_PFA_LIGHT';

  // ── PENDING or REJECTED → status card (no marketplace yet) ───────────
  if (!isVerified) {
    return (
      <main className="min-h-screen bg-hir-bg px-4 py-8 text-hir-fg">
        <div className="mx-auto flex w-full max-w-md flex-col gap-6">
          <PfaHeader fleetName={fleet.name} cui={fleet.pfa_cui} />
          <StatusCard kyf={kyf} />
        </div>
      </main>
    );
  }

  // ── VERIFIED → load marketplace preview scoped to this PFA ───────────
  // Hot path: open listings in the fleet's primary city, fleet's pending
  // offers, fleet's matches. Mirrors /fleet/marketplace KPIs, but uses
  // fleet.id directly (we already verified ownership above).
  let openListingsQuery = admin
    .from('marketplace_listings')
    .select(
      'id, city_id, vertical, delivery_window_start, delivery_window_end, package_description, package_weight_grams, pickup_address',
    )
    .eq('status', 'OPEN')
    .gt('delivery_window_end', new Date().toISOString());
  if (fleet.primary_city_id) {
    openListingsQuery = openListingsQuery.eq('city_id', fleet.primary_city_id);
  }

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

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
      .eq('fleet_id', fleet.id)
      .eq('status', 'PENDING'),
    admin
      .from('marketplace_matches')
      .select('status, hir_fee_cents')
      .eq('fleet_id', fleet.id)
      .order('matched_at', { ascending: false })
      .limit(50),
    admin
      .from('marketplace_matches')
      .select('hir_fee_cents')
      .eq('fleet_id', fleet.id)
      .gte('matched_at', monthStart.toISOString()),
  ]);

  const openListings = (openListingsData ?? []) as ListingPreview[];
  const pendingOffers = (myPendingOffersData ?? []) as OfferRow[];
  const matches = (myMatchesData ?? []) as MatchRow[];
  const mtdMatches = (myMatchesMtdData ?? []) as Array<{ hir_fee_cents: number | null }>;

  const acceptedCount = matches.filter((m) =>
    ['MATCHED', 'IN_PROGRESS', 'DELIVERED'].includes(m.status),
  ).length;
  const feesMtdCents = mtdMatches.reduce(
    (sum, m) => sum + (Number(m.hir_fee_cents) || 0),
    0,
  );

  return (
    <main className="min-h-screen bg-hir-bg px-4 py-8 text-hir-fg">
      <div className="mx-auto flex w-full max-w-md flex-col gap-6">
        <PfaHeader fleetName={fleet.name} cui={fleet.pfa_cui} />

        {!fleet.is_active ? (
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200">
            Verificarea a fost aprobată, dar flota este momentan inactivă. Activeaz-o
            din panou pentru a putea oferta.
          </div>
        ) : null}

        {/* KPI grid */}
        <div className="grid grid-cols-2 gap-3">
          <Kpi
            icon={<FileSearch className="h-4 w-4 text-violet-400" aria-hidden />}
            label="Cereri deschise"
            value={String(openListings.length)}
            hint="în orașul tău"
          />
          <Kpi
            icon={<Gavel className="h-4 w-4 text-sky-400" aria-hidden />}
            label="Ofertele mele"
            value={String(pendingOffers.length)}
            hint="în așteptare"
          />
          <Kpi
            icon={<CheckCircle2 className="h-4 w-4 text-emerald-400" aria-hidden />}
            label="Câștigate"
            value={String(acceptedCount)}
            hint="ultimele 50"
          />
          <Kpi
            icon={<Banknote className="h-4 w-4 text-emerald-400" aria-hidden />}
            label="Taxe HIR luna"
            value={formatRon(feesMtdCents)}
            hint="comision platformă"
          />
        </div>

        {/* Open listings preview — same shape as fleet marketplace */}
        <section className="rounded-2xl border border-hir-border bg-hir-surface p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-hir-fg">
              Cereri deschise{' '}
              <span className="text-hir-muted-fg">({openListings.length})</span>
            </h2>
            <Link
              href="/fleet/marketplace/listings"
              className="inline-flex min-h-[44px] items-center gap-1 px-2 text-xs font-medium text-violet-300 hover:text-violet-200 focus-visible:outline-2 focus-visible:outline-violet-500 focus-visible:outline-offset-2"
            >
              Vezi toate
              <ArrowRight className="h-3 w-3" aria-hidden />
            </Link>
          </div>
          {openListings.length === 0 ? (
            <div className="rounded-xl border border-dashed border-hir-border bg-hir-surface px-4 py-6 text-center text-xs text-hir-muted-fg">
              {fleet.primary_city_id
                ? 'Nu sunt cereri deschise în orașul tău acum.'
                : 'Setează orașul principal în setări ca să vezi cereri din zonă.'}
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {openListings.map((listing) => (
                <li key={listing.id}>
                  <Link
                    href={`/fleet/marketplace/listings/${listing.id}`}
                    className="block rounded-xl border border-hir-border bg-hir-surface p-3 hover:border-violet-500/40 hover:bg-hir-border focus-visible:outline-2 focus-visible:outline-violet-500 focus-visible:outline-offset-2"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-violet-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-300">
                            {listing.vertical}
                          </span>
                          <p className="truncate text-sm font-medium text-hir-fg">
                            {listing.package_description ?? 'Pachet'}
                          </p>
                        </div>
                        <p className="mt-1 flex items-center gap-1.5 text-xs text-hir-muted-fg">
                          <MapPin className="h-3 w-3" aria-hidden />
                          {pickupSummary(listing.pickup_address)}
                        </p>
                        <p className="mt-1 flex items-center gap-1.5 text-xs text-hir-muted-fg">
                          <Package className="h-3 w-3" aria-hidden />
                          {formatWindow(
                            listing.delivery_window_start,
                            listing.delivery_window_end,
                          )}
                        </p>
                      </div>
                      <span className="inline-flex shrink-0 items-center rounded-md bg-violet-500/15 px-2 py-1 text-[11px] font-semibold text-violet-200">
                        Ofertează
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Quick links */}
        <div className="grid grid-cols-2 gap-3">
          <QuickLink
            href="/fleet/marketplace/offers"
            icon={<Gavel className="h-4 w-4" aria-hidden />}
            label="Ofertele mele"
            hint={`${pendingOffers.length} în așteptare`}
          />
          <QuickLink
            href="/fleet/marketplace/matches"
            icon={<CheckCircle2 className="h-4 w-4" aria-hidden />}
            label="Livrări câștigate"
            hint={`${acceptedCount} active`}
          />
        </div>

        <Link
          href="/fleet/settings"
          className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-hir-border bg-hir-surface px-4 text-sm font-medium text-hir-fg hover:bg-hir-border focus-visible:outline-2 focus-visible:outline-violet-500 focus-visible:outline-offset-2"
        >
          Setări PFA
        </Link>
      </div>
    </main>
  );
}

function PfaHeader({ fleetName, cui }: { fleetName: string; cui: string | null }) {
  return (
    <header className="flex items-start gap-3">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-violet-500/15 ring-1 ring-violet-500/30 shadow-md shadow-violet-500/15">
        <ShieldCheck className="h-5 w-5 text-violet-300" aria-hidden strokeWidth={2.25} />
      </span>
      <div className="min-w-0">
        <h1 className="truncate text-xl font-semibold tracking-tight text-hir-fg">
          {fleetName}
        </h1>
        <p className="mt-0.5 text-xs text-hir-muted-fg">
          PFA • {cui ? `CUI ${cui}` : 'CUI nesetat'}
        </p>
      </div>
    </header>
  );
}

function StatusCard({ kyf }: { kyf: KyfRow | null }) {
  if (!kyf) {
    return (
      <section className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-5 text-sm text-amber-100">
        <div className="flex items-center gap-2 font-semibold">
          <Clock className="h-5 w-5" aria-hidden />
          Verificare în curs
        </div>
        <p className="mt-2 text-amber-100/90">
          Datele PFA au fost trimise. Verificăm CUI-ul la ANAF — durează sub un minut.
        </p>
      </section>
    );
  }
  if (kyf.kyf_status === 'REJECTED') {
    return (
      <section className="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-5 text-sm text-rose-200">
        <div className="flex items-center gap-2 font-semibold">
          Verificare respinsă
        </div>
        {kyf.rejected_reason ? (
          <p className="mt-2 text-rose-200/90">{kyf.rejected_reason}</p>
        ) : (
          <p className="mt-2 text-rose-200/90">
            Datele PFA nu au putut fi validate. Verifică formularul și încearcă din nou.
          </p>
        )}
        <Link
          href="/pfa-signup"
          className="mt-4 inline-flex min-h-[44px] items-center justify-center rounded-xl border border-rose-500/40 bg-rose-500/15 px-4 text-xs font-semibold text-rose-100 hover:bg-rose-500/25 focus-visible:outline-2 focus-visible:outline-rose-400 focus-visible:outline-offset-2"
        >
          Reîncearcă înregistrarea
        </Link>
      </section>
    );
  }
  // PENDING
  return (
    <section className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-5 text-sm text-amber-100">
      <div className="flex items-center gap-2 font-semibold">
        <Clock className="h-5 w-5" aria-hidden />
        Verificare în curs
      </div>
      <p className="mt-2 text-amber-100/90">
        Verificăm CUI-ul la ANAF și actele tale. Vei putea oferta în piață imediat ce
        verificarea trece (de obicei sub un minut).
      </p>
    </section>
  );
}

function Kpi({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-hir-border bg-hir-surface p-3">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-hir-muted-fg">
        {icon}
        {label}
      </div>
      <p className="mt-1 text-xl font-semibold text-hir-fg">{value}</p>
      {hint ? <p className="mt-0.5 text-[11px] text-hir-muted-fg">{hint}</p> : null}
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
    <Link
      href={href}
      className="flex min-h-[44px] items-center gap-3 rounded-2xl border border-hir-border bg-hir-surface px-4 py-3 hover:border-violet-500/40 hover:bg-hir-surface/70 focus-visible:outline-2 focus-visible:outline-violet-500 focus-visible:outline-offset-2"
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-violet-500/10 text-violet-300">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-hir-fg">{label}</p>
        <p className="text-xs text-hir-muted-fg">{hint}</p>
      </div>
      <ArrowRight className="h-4 w-4 text-hir-muted-fg" aria-hidden />
    </Link>
  );
}
