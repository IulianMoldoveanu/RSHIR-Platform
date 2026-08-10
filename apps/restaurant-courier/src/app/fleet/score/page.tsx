// Stream UI-3 — Rating + Job board (Open Marketplace Extensions).
//
// /fleet/score — fleet-manager view of the aggregate score + tier band.
//
// What the fleet manager sees:
//   • Tier badge (Gold/Silver/Bronze/Probation/Unrated) — the PUBLIC surface
//     vendors see on marketplace cards.
//   • Raw avg_rating + match count + on-time % + dispute count — owner-only.
//   • Auto-pause warning when avg_rating < 3.80 over >= 10 matches in 30d
//     (the SQL helper `fn_recalc_fleet_aggregate` sets `auto_paused_at`;
//     until it triggers, we surface a soft warning band when the rolling
//     average is approaching the threshold).
//
// Per board verdict: the FLEET sees its own numeric (it's their score).
// Vendors only see the tier band (RatingTierBadge), never raw numeric.
//
// Data plane: `fleet_aggregate_scores` (RLS allows fleet owner to SELECT
// own row via `is_fleet_owner_of(fleet_id)`).

import { notFound } from 'next/navigation';
import { AlertTriangle, ShieldAlert, ShieldCheck, Star } from 'lucide-react';
import { requireFleetManager } from '@/lib/fleet-manager';
import { createAdminClientUntyped } from '@/lib/supabase/admin';
import { RatingTierBadge, tierFromAvgRating } from '@/app/_components';
import { isRatingSystemEnabled } from '@/lib/feature-flags';
import { PageHeader, Card, StatCard, ErrorState } from '@/app/_marketplace-ui';

export const dynamic = 'force-dynamic';

type AggregateRow = {
  fleet_id: string;
  avg_rating: number | null;
  on_time_pct: number | null;
  dispute_count: number;
  total_matches: number;
  calculated_at: string | null;
  auto_paused_at: string | null;
  auto_pause_reason: string | null;
};

// Auto-pause threshold lives in `fn_recalc_fleet_aggregate` SQL helper.
// Mirrored here for the UI warning band, NOT for enforcement.
const AUTO_PAUSE_AVG_THRESHOLD = 3.8;
const AUTO_PAUSE_MIN_MATCHES = 10;
// Approaching-threshold soft-warn band (UI only). The SQL helper does not
// pause here; we just colour the card amber so the fleet sees it coming.
const SOFT_WARN_BAND = 3.95;

export default async function FleetScorePage() {
  if (!isRatingSystemEnabled()) notFound();

  const fleet = await requireFleetManager();
  const admin = createAdminClientUntyped();

  const { data: row, error } = await admin
    .from('fleet_aggregate_scores')
    .select(
      'fleet_id, avg_rating, on_time_pct, dispute_count, total_matches, calculated_at, auto_paused_at, auto_pause_reason',
    )
    .eq('fleet_id', fleet.fleetId)
    .maybeSingle();

  if (error) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-5">
        <PageHeader variant="hero" eyebrow="MARKETPLACE FLOTĂ" title="Scor flotă" />
        <ErrorState
          title="Nu am putut încărca scorul."
          description="Reîncarcă pagina sau revino mai târziu."
        />
      </div>
    );
  }

  const agg = (row as AggregateRow | null) ?? {
    fleet_id: fleet.fleetId,
    avg_rating: null,
    on_time_pct: null,
    dispute_count: 0,
    total_matches: 0,
    calculated_at: null,
    auto_paused_at: null,
    auto_pause_reason: null,
  };

  const avgNumeric = agg.avg_rating == null ? null : Number(agg.avg_rating);
  const tier = tierFromAvgRating(avgNumeric, agg.total_matches, 5);
  const isPaused = !!agg.auto_paused_at;
  const isApproachingPause =
    !isPaused &&
    avgNumeric != null &&
    avgNumeric < SOFT_WARN_BAND &&
    agg.total_matches >= AUTO_PAUSE_MIN_MATCHES;

  const updated = agg.calculated_at
    ? new Intl.DateTimeFormat('ro-RO', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(agg.calculated_at))
    : '—';

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <PageHeader
        variant="hero"
        eyebrow="MARKETPLACE FLOTĂ"
        title="Scor flotă"
        description="Reputația flotei tale pe ultimele 30 de zile. Vendorii văd doar tier-ul (Gold/Silver/Bronze), nu cifra exactă."
      />

      {/* Auto-pause warning band — visible above the score card if the SQL
          helper paused the fleet. Sticky pause means ops has to unpause
          manually, so the courier sees this until reviewed. */}
      {isPaused ? (
        <div className="flex items-start gap-3 rounded-2xl border border-rose-500/40 bg-rose-500/10 p-4">
          <ShieldAlert className="h-5 w-5 shrink-0 text-rose-300" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-rose-200">
              Flota este suspendată automat
            </p>
            <p className="mt-0.5 text-xs text-rose-200/80">
              {agg.auto_pause_reason ??
                `Scorul mediu este sub ${AUTO_PAUSE_AVG_THRESHOLD} pe mai mult de ${AUTO_PAUSE_MIN_MATCHES} curse în 30 de zile.`}
            </p>
            <p className="mt-2 text-[11px] text-rose-200/80">
              Contactează echipa HIR pentru ridicarea suspendării după ce
              îmbunătățești scorul.
            </p>
          </div>
        </div>
      ) : isApproachingPause ? (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4">
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-300" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-amber-200">
              Atenție: te apropii de pragul de suspendare
            </p>
            <p className="mt-0.5 text-xs text-amber-200/80">
              Sub {AUTO_PAUSE_AVG_THRESHOLD} pe {AUTO_PAUSE_MIN_MATCHES} curse înseamnă
              suspendare automată. Vorbește cu echipa de curieri.
            </p>
          </div>
        </div>
      ) : null}

      {/* Main score card */}
      <Card accent className="p-5">
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-violet-500/10 text-violet-300 ring-1 ring-inset ring-violet-500/20">
            {isPaused ? (
              <ShieldAlert className="h-7 w-7" strokeWidth={1.75} aria-hidden />
            ) : (
              <ShieldCheck className="h-7 w-7" strokeWidth={1.75} aria-hidden />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-bold text-hir-fg">Reputație publică</h2>
              <RatingTierBadge tier={tier} />
            </div>
            <p className="mt-0.5 text-xs text-hir-muted-fg">
              Așa vede flota ta vendorii din marketplace.
            </p>
          </div>
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard
            label="Medie"
            value={avgNumeric != null ? avgNumeric.toFixed(2) : '—'}
            icon={<Star className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />}
          />
          <StatCard label="Curse 30z" value={agg.total_matches.toLocaleString('ro-RO')} />
          <StatCard
            label="La timp"
            value={agg.on_time_pct != null ? `${Number(agg.on_time_pct).toFixed(0)}%` : '—'}
          />
          <StatCard
            label="Dispute"
            value={agg.dispute_count.toLocaleString('ro-RO')}
            className={agg.dispute_count > 0 ? '[&_p]:text-amber-300' : undefined}
          />
        </dl>

        <p className="mt-4 text-[11px] text-hir-muted-fg">
          Actualizat: <span className="tabular-nums">{updated}</span> · Fereastra de calcul:
          ultimele 30 de zile · rating-urile detectate ca anti-gaming sunt excluse.
        </p>
      </Card>

      <p className="text-[11px] leading-relaxed text-hir-muted-fg">
        Tier-uri: Gold ≥ 4,50 · Silver ≥ 4,00 · Bronze ≥ 3,50 · Probă &lt; 3,50.
        Suspendare automată: medie sub {AUTO_PAUSE_AVG_THRESHOLD} pe ≥ {AUTO_PAUSE_MIN_MATCHES} curse
        în 30 de zile.
      </p>
    </div>
  );
}
