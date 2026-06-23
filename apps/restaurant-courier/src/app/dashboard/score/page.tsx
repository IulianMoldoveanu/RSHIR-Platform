// Stream UI-3 — Rating + Job board (Open Marketplace Extensions).
//
// /dashboard/score — the COURIER's private driver-score page.
//
// What the courier sees here:
//   • Composite score 0..100 (Bolt-style, rolling 100 deliveries)
//   • 4-factor breakdown: completion 40% / on-time 30% / accept 20% / 1-cancel 10%
//   • Last-100 delivery counts (accepted / on-time / completed / cancelled / total)
//   • NOT a public 5-star value — per board verdict, public surface is tier
//     only (Gold/Silver/Bronze) at the FLEET aggregate, never per-courier.
//
// Feature flag: HIR_FEATURE_RATING_SYSTEM_ENABLED. When off, the page 404s
// (notFound) so the route still resolves type-check but never renders. The
// gating function is centralised so a single flip in env switches every
// rating surface together.
//
// Data plane comes from `driver_scores` (migration 20260616_012_rating_dual_axis.sql).
// RLS policy `courier_reads_own_driver_score` already restricts SELECT to
// `auth.uid()`; we go through the service-role admin client because (a) the
// courier app's typed client is stale and (b) we still scope by user_id in
// the query — same fail-safe pattern used in earnings/page.tsx.

import { notFound } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClientUntyped } from '@/lib/supabase/admin';
import { DriverScoreCard, type DriverScoreBreakdown } from '@/app/_components';
import { isRatingSystemEnabled } from '@/lib/feature-flags';
import { PageHeader, StatCard, ErrorState, EmptyMarketplaceState } from '@/app/_marketplace-ui';

export const dynamic = 'force-dynamic';

type DriverScoreRow = {
  courier_user_id: string;
  score: number;
  breakdown: DriverScoreBreakdown | null;
  last_calculated_at: string | null;
  rolling_window_count: number | null;
};

export default async function DriverScorePage() {
  if (!isRatingSystemEnabled()) notFound();

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createAdminClientUntyped();

  const { data: row, error } = await admin
    .from('driver_scores')
    .select('courier_user_id, score, breakdown, last_calculated_at, rolling_window_count')
    .eq('courier_user_id', user.id)
    .maybeSingle();

  if (error) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-5">
        <PageHeader
          variant="hero"
          eyebrow="HIR · SCOR ȘOFER"
          title="Scor șofer"
          description="Performanța ta pe ultimele 100 de livrări."
        />
        <ErrorState
          title="Nu am putut încărca scorul."
          description="Reîncarcă pagina sau revino mai târziu."
        />
      </div>
    );
  }

  const score = (row as DriverScoreRow | null) ?? null;

  // Seed shape — the SQL helper initialises driver_scores at 50/neutral when
  // a courier first appears; until the first DELIVERED match triggers
  // recompute, the row may not exist at all. Show the neutral state.
  const empty: DriverScoreRow = {
    courier_user_id: user.id,
    score: 50,
    breakdown: {
      accept_rate: 0,
      on_time_rate: 0,
      completion_rate: 0,
      cancellation_rate: 0,
      counts: { accepted: 0, on_time: 0, completed: 0, cancelled: 0, total: 0 },
    },
    last_calculated_at: null,
    rolling_window_count: 100,
  };

  const effective = score ?? empty;
  const breakdown: DriverScoreBreakdown = (effective.breakdown ?? empty.breakdown) as DriverScoreBreakdown;
  const counts = breakdown.counts ?? {
    accepted: 0,
    on_time: 0,
    completed: 0,
    cancelled: 0,
    total: 0,
  };
  const totalWindow = counts.total ?? 0;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <PageHeader
        variant="hero"
        eyebrow="HIR · SCOR ȘOFER"
        title="Scor șofer"
        description="Performanța ta pe ultimele 100 de livrări."
      />

      {/* Empty state — no deliveries in window yet */}
      {totalWindow === 0 ? (
        <EmptyMarketplaceState
          title="Încă fără livrări în fereastra de scor."
          description="După prima livrare finalizată, scorul tău va fi calculat automat."
        />
      ) : null}

      <DriverScoreCard
        score={Number(effective.score) || 50}
        breakdown={breakdown}
        lastCalculatedAt={effective.last_calculated_at}
        rollingWindowCount={effective.rolling_window_count ?? 100}
      />

      {/* Last-window counts — the raw numbers behind each bar. */}
      <section>
        <div className="mb-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-hir-fg">
            <span aria-hidden className="h-4 w-1 rounded-full bg-gradient-to-b from-violet-500 to-violet-400" />
            Detaliu ultima sută
          </h2>
          <p className="mt-0.5 text-xs text-hir-muted-fg">
            Numărul exact de livrări care contribuie la scor.
          </p>
        </div>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <StatCard label="Total" value={counts.total.toLocaleString('ro-RO')} />
          <StatCard label="Acceptate" value={counts.accepted.toLocaleString('ro-RO')} />
          <StatCard label="Livrate" value={counts.completed.toLocaleString('ro-RO')} />
          <StatCard label="La timp" value={counts.on_time.toLocaleString('ro-RO')} />
          <StatCard
            label="Anulate"
            value={counts.cancelled.toLocaleString('ro-RO')}
            className={counts.cancelled > 0 ? '[&_p]:text-amber-300' : undefined}
          />
        </dl>
      </section>

      <p className="text-[11px] leading-relaxed text-hir-muted-fg">
        Scorul tău este privat — îl vezi doar tu. Flota vede media generală a flotei
        (Gold / Silver / Bronze), nu cifra ta individuală. Marketplace-ul B2B
        folosește media flotei pentru a recomanda flota la clienții vendori.
      </p>
    </div>
  );
}
