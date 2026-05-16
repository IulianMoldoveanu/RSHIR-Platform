'use client';

import { useState, useTransition } from 'react';
import { awardLadderTierAction } from '../actions';
import type { LadderTier } from '@/lib/partner-v3-constants';

type LadderTierDef = {
  restaurants: number;
  cents: number;
  rank: number;
  perks: string;
};

type MilestoneRow = {
  tier_reached: string;
  awarded_at: string;
  bonus_amount_cents: number;
};

const TIER_ORDER: LadderTier[] = ['BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'DIAMOND'];

const TIER_COLORS: Record<LadderTier, string> = {
  BRONZE: 'bg-orange-100 text-orange-800 border-orange-200',
  SILVER: 'bg-zinc-100 text-zinc-700 border-zinc-300',
  GOLD: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  PLATINUM: 'bg-purple-100 text-purple-800 border-purple-200',
  DIAMOND: 'bg-cyan-100 text-cyan-800 border-cyan-200',
};

export function LadderPanel({
  partnerId,
  milestones,
  ladderTiers,
}: {
  partnerId: string;
  milestones: MilestoneRow[];
  ladderTiers: Record<LadderTier, LadderTierDef>;
}) {
  const [pending, startTransition] = useTransition();
  const [pendingTier, setPendingTier] = useState<LadderTier | null>(null);
  const [results, setResults] = useState<Record<string, { ok: boolean; msg: string }>>({});

  const awardedTiers = new Set(milestones.map((m) => m.tier_reached));

  function handleAward(tier: LadderTier) {
    const tierDef = ladderTiers[tier];
    const bonusEur = (tierDef.cents / 100).toFixed(0);

    if (
      !window.confirm(
        `Acorzi treapta ${tier} acestui partener? Bonus: €${bonusEur}. Aceasta actiune insereaza un rand in ladder_milestones (ON CONFLICT DO NOTHING — daca treapta exista deja, nu se dubleaza).`,
      )
    )
      return;

    setPendingTier(tier);
    setResults((prev) => ({ ...prev, [tier]: { ok: false, msg: '' } }));

    startTransition(async () => {
      const res = await awardLadderTierAction(partnerId, tier);
      setPendingTier(null);
      setResults((prev) => ({
        ...prev,
        [tier]: res.ok
          ? { ok: true, msg: `${tier} acordat.` }
          : { ok: false, msg: res.error },
      }));
    });
  }

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
      <h2 className="mb-1 text-base font-semibold text-zinc-900">Acordare manuala Ladder</h2>
      <p className="mb-4 text-xs text-zinc-500">
        Acorda o treapta manual (de ex. pentru ajustari sau corectii). Cron-ul lunar acorda
        automat pe baza pragurilor. Acorda manual doar in cazuri exceptionale — bonusul se
        inregistreaza in ladder_milestones si se plateste la urmatorul ciclu de payout.
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-5">
        {TIER_ORDER.map((tier) => {
          const def = ladderTiers[tier];
          const isAwarded = awardedTiers.has(tier);
          const milestone = milestones.find((m) => m.tier_reached === tier);
          const isPendingThis = pending && pendingTier === tier;
          const tierResult = results[tier];

          return (
            <div
              key={tier}
              className={`flex flex-col gap-2 rounded-xl border p-3 ${TIER_COLORS[tier]}`}
            >
              <div className="text-xs font-bold">{tier}</div>
              <div className="text-xs">
                {def.restaurants} restaurante · &euro;{(def.cents / 100).toFixed(0)}
              </div>
              <div className="text-xs leading-snug text-zinc-600">{def.perks}</div>

              {isAwarded && milestone ? (
                <div className="mt-auto">
                  <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                    Acordat
                  </span>
                  <div className="mt-0.5 text-xs text-zinc-500">
                    {new Date(milestone.awarded_at).toLocaleDateString('ro-RO')}
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => handleAward(tier)}
                  className="mt-auto rounded-md bg-white px-2 py-1 text-xs font-medium text-zinc-800 shadow-sm hover:bg-zinc-50 disabled:opacity-50"
                >
                  {isPendingThis ? '...' : 'Acorda'}
                </button>
              )}

              {tierResult && tierResult.msg && (
                <p
                  className={`text-xs ${tierResult.ok ? 'text-emerald-700' : 'text-rose-600'}`}
                >
                  {tierResult.msg}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
