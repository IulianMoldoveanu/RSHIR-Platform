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
      <div className="mx-auto flex max-w-2xl flex-col gap-4">
        <h1 className="text-xl font-semibold tracking-tight text-hir-fg">Scor șofer</h1>
        <p className="text-sm text-rose-400">
          Eroare la încărcarea scorului: {error.message}
        </p>
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
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-hir-fg">Scor șofer</h1>
        <p className="mt-0.5 text-sm text-hir-muted-fg">
          Performanța ta pe ultimele 100 de livrări.
        </p>
      </div>

      {/* Empty state — no deliveries in window yet */}
      {totalWindow === 0 ? (
        <div className="rounded-2xl border border-dashed border-hir-border bg-hir-surface p-5 text-sm text-hir-muted-fg">
          Încă nu ai livrări înregistrate în fereastra de scor. După prima livrare
          finalizată, scorul tău va fi calculat automat.
        </div>
      ) : null}

      <DriverScoreCard
        score={Number(effective.score) || 50}
        breakdown={breakdown}
        lastCalculatedAt={effective.last_calculated_at}
        rollingWindowCount={effective.rolling_window_count ?? 100}
      />

      {/* Last-window counts table — gives the courier the raw numbers behind
          each bar. Tabular-nums for column alignment. */}
      <section className="rounded-2xl border border-hir-border bg-hir-surface p-4">
        <h2 className="text-sm font-semibold text-hir-fg">Detaliu ultima sută</h2>
        <p className="mt-0.5 text-xs text-hir-muted-fg">
          Numărul exact de livrări care contribuie la scor.
        </p>
        <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Stat label="Total" value={counts.total} />
          <Stat label="Acceptate" value={counts.accepted} />
          <Stat label="Livrate" value={counts.completed} />
          <Stat label="La timp" value={counts.on_time} />
          <Stat label="Anulate" value={counts.cancelled} tone={counts.cancelled > 0 ? 'warn' : 'ok'} />
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

function Stat({
  label,
  value,
  tone = 'ok',
}: {
  label: string;
  value: number;
  tone?: 'ok' | 'warn';
}) {
  return (
    <div className="rounded-xl border border-hir-border bg-hir-surface p-3">
      <dt className="text-[10px] uppercase tracking-wide text-hir-muted-fg">{label}</dt>
      <dd
        className={`mt-1 text-lg font-semibold tabular-nums ${
          tone === 'warn' ? 'text-amber-300' : 'text-hir-fg'
        }`}
      >
        {value.toLocaleString('ro-RO')}
      </dd>
    </div>
  );
}
