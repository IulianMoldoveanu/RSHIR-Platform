// Faza 0 (2026-06-15) — DIRECT commission unlock status card.
// Extracted from /partner-portal/page.tsx to keep that file lean while
// preserving the four-state contract EXACTLY:
//
//   1. neutral (zinc)  — KPI unavailable (kpiErr or row missing) — null
//   2. empty   (zinc)  — zero referrals + zero live (onboarding hint)
//   3. amber           — referred but under threshold (progress bar)
//   4. emerald         — unlocked (>= threshold)
//
// The four-state logic is the cron's payout truth-source — it MUST stay
// in lock-step with supabase/functions/partner-commission-calc/index.ts.
// If you change the gate, change both at once (see also `safeThreshold`).
//
// Pure presentational, server-safe.

export type DirectUnlockCardProps = {
  /**
   * Count of distinct referred tenants that delivered in the last 30 days.
   * Null means "couldn't read v_partner_kpis" → renders neutral state.
   */
  activeLiveCount: number | null;
  /** Effective threshold (floor of 1; Faza 0 H4 guards against 0-drift). */
  effectiveThreshold: number;
  /** Total referral count — used to disambiguate empty vs in-progress. */
  totalReferrals: number;
  /** Default commission pct copy ("20%" etc.). */
  defaultCommissionPct: number;
};

export function DirectUnlockCard({
  activeLiveCount,
  effectiveThreshold,
  totalReferrals,
  defaultCommissionPct,
}: DirectUnlockCardProps) {
  const isNeutral = activeLiveCount === null;
  const directUnlocked =
    activeLiveCount !== null && activeLiveCount >= effectiveThreshold;
  const remainingToUnlock =
    activeLiveCount === null
      ? null
      : Math.max(0, effectiveThreshold - activeLiveCount);
  const hasNoReferrals =
    activeLiveCount !== null && activeLiveCount === 0 && totalReferrals === 0;
  const progressPct =
    activeLiveCount !== null
      ? Math.min(100, Math.round((activeLiveCount / effectiveThreshold) * 100))
      : 0;

  // H3 — KPI unavailable: neutral zinc card, no number, no alarm.
  if (isNeutral) {
    return (
      <section
        aria-label="Bonificație DIRECT — progres deblocare"
        className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 sm:p-5"
      >
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className="mt-0.5 inline-flex h-6 w-6 flex-none items-center justify-center rounded-full bg-zinc-200 text-xs font-bold text-zinc-700"
          >
            ?
          </span>
          <div>
            <h2 className="text-sm font-semibold text-zinc-800">
              Verificăm progresul partenerilor…
            </h2>
            <p className="mt-1 text-sm text-zinc-600">
              Reîmprospătăm datele de livrare. Bonificația DIRECT (
              {defaultCommissionPct.toFixed(0)}% pe Anul 1) se deblochează când
              vendorii tăi încep să livreze.
            </p>
          </div>
        </div>
      </section>
    );
  }

  // H4 — no referrals at all: empty onboarding state, no progress bar.
  if (hasNoReferrals) {
    return (
      <section
        aria-label="Bonificație DIRECT — progres deblocare"
        className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 sm:p-5"
      >
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className="mt-0.5 inline-flex h-6 w-6 flex-none items-center justify-center rounded-full bg-zinc-200 text-xs font-bold text-zinc-700"
          >
            +
          </span>
          <div>
            <h2 className="text-sm font-semibold text-zinc-800">
              Niciun vendor referit încă
            </h2>
            <p className="mt-1 text-sm text-zinc-600">
              Începe înscriind primul vendor prin codul tău. Bonificația DIRECT
              ({defaultCommissionPct.toFixed(0)}% pe Anul 1) se deblochează
              după {effectiveThreshold} vendori care livrează în ultimele 30
              zile.
            </p>
          </div>
        </div>
      </section>
    );
  }

  // Unlocked (emerald) or in-progress (amber)
  return (
    <section
      aria-label="Bonificație DIRECT — progres deblocare"
      className={`rounded-xl border p-4 sm:p-5 ${
        directUnlocked
          ? 'border-emerald-300 bg-emerald-50'
          : 'border-amber-300 bg-amber-50'
      }`}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className={`mt-0.5 inline-flex h-6 w-6 flex-none items-center justify-center rounded-full text-xs font-bold ${
            directUnlocked
              ? 'bg-emerald-200 text-emerald-900'
              : 'bg-amber-200 text-amber-900'
          }`}
        >
          {directUnlocked ? '✓' : '!'}
        </span>
        <div className="min-w-0 flex-1">
          <h2
            className={`text-sm font-semibold ${
              directUnlocked ? 'text-emerald-900' : 'text-amber-900'
            }`}
          >
            {directUnlocked
              ? `Câștigi ${defaultCommissionPct.toFixed(0)}% din fiecare comandă livrată`
              : `Vendori care livrează (ultimele 30 zile): ${activeLiveCount}/${effectiveThreshold} — încă ${remainingToUnlock ?? 0} pentru bonificația ${defaultCommissionPct.toFixed(0)}% Anul 1`}
          </h2>
          <p
            className={`mt-1 text-sm ${
              directUnlocked ? 'text-emerald-800' : 'text-amber-800'
            }`}
          >
            {directUnlocked
              ? 'Bonificația DIRECT se calculează lunar pe livrările tenanților referiți. Continuă să aduci vendori activi pentru a urca în tier.'
              : 'Bonificația DIRECT (20% pe Anul 1) se deblochează după ce ai cel puțin pragul de vendori care livrează în ultimele 30 zile. Bonusurile WAVE, OVERRIDE și CHAMPION nu sunt afectate de prag.'}
          </p>
          {!directUnlocked ? (
            <>
              <div
                className="mt-3 h-2 w-full overflow-hidden rounded-full bg-amber-100"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={effectiveThreshold}
                aria-valuenow={activeLiveCount ?? 0}
                aria-label="Progres deblocare bonificație DIRECT"
              >
                <div
                  className="h-full rounded-full bg-amber-500 transition-all duration-300"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <p className="mt-2 text-[11px] text-amber-700">
                Un vendor referit contează abia după prima livrare confirmată
                în ultimele 30 zile.
              </p>
            </>
          ) : null}
        </div>
      </div>
    </section>
  );
}
