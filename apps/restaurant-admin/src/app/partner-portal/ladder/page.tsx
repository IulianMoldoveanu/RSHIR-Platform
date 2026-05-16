// /partner-portal/ladder — Bronze→Diamond progress visualization
//
// Server component. Auth gated by layout.

import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { LADDER_TIERS, type LadderTier } from '@/lib/partner-v3-constants';

export const dynamic = 'force-dynamic';

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ro-RO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

const TIER_ORDER: LadderTier[] = ['BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'DIAMOND'];

const TIER_COLORS: Record<LadderTier, { bg: string; ring: string; text: string; badge: string }> = {
  BRONZE:   { bg: 'bg-amber-50',   ring: 'ring-amber-300',   text: 'text-amber-900',   badge: 'bg-amber-200 text-amber-900' },
  SILVER:   { bg: 'bg-zinc-50',    ring: 'ring-zinc-300',    text: 'text-zinc-700',    badge: 'bg-zinc-200 text-zinc-800' },
  GOLD:     { bg: 'bg-yellow-50',  ring: 'ring-yellow-400',  text: 'text-yellow-900',  badge: 'bg-yellow-300 text-yellow-900' },
  PLATINUM: { bg: 'bg-indigo-50',  ring: 'ring-indigo-300',  text: 'text-indigo-900',  badge: 'bg-indigo-200 text-indigo-900' },
  DIAMOND:  { bg: 'bg-purple-50',  ring: 'ring-purple-400',  text: 'text-purple-900',  badge: 'bg-purple-200 text-purple-900' },
};

export default async function LadderPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const { data: rawPartner } = await admin
    .from('partners')
    .select('id')
    .eq('user_id', user.id)
    .in('status', ['PENDING', 'ACTIVE'])
    .maybeSingle();

  if (!rawPartner) redirect('/login');
  const partnerId = rawPartner.id as string;

  // Count active referrals (ended_at IS NULL)
  const { count: activeReferralCount } = await admin
    .from('partner_referrals')
    .select('id', { count: 'exact', head: true })
    .eq('partner_id', partnerId)
    .is('ended_at', null);

  const restaurantCount = activeReferralCount ?? 0;

  // Achieved milestones from ladder_milestones table
  const { data: rawMilestones } = await admin
    .from('ladder_milestones')
    .select('tier_reached, awarded_at, paid_at')
    .eq('partner_id', partnerId);

  const milestonesMap = new Map<
    string,
    { awarded_at: string; paid_at: string | null }
  >();
  for (const m of (rawMilestones ?? []) as Array<{
    tier_reached: string;
    awarded_at: string;
    paid_at: string | null;
  }>) {
    milestonesMap.set(m.tier_reached, {
      awarded_at: m.awarded_at,
      paid_at: m.paid_at,
    });
  }

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">Ladder recompense</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Fiecare prag atins aduce un bonus în numerar. Cu cât aduci mai multe restaurante, cu
          atât cresc premiile.
        </p>
      </header>

      {/* Current count summary */}
      <div className="flex items-center gap-4 rounded-lg border border-zinc-200 bg-white px-5 py-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Restaurante active aduse
          </p>
          <p className="mt-0.5 text-3xl font-bold tabular-nums text-zinc-900">
            {restaurantCount}
          </p>
        </div>
      </div>

      {/* Tier cards */}
      <div className="flex flex-col gap-4">
        {TIER_ORDER.map((tier) => {
          const config = LADDER_TIERS[tier];
          const colors = TIER_COLORS[tier];
          const milestone = milestonesMap.get(tier) ?? null;
          const achieved = restaurantCount >= config.restaurants;
          const inProgress = !achieved && (tier === TIER_ORDER[0] || restaurantCount > 0);
          const progressPct = achieved
            ? 100
            : Math.min(100, (restaurantCount / config.restaurants) * 100);

          let badgeLabel: string;
          let badgeClass: string;
          if (milestone) {
            badgeLabel = 'REALIZAT';
            badgeClass = 'bg-emerald-200 text-emerald-900';
          } else if (achieved) {
            badgeLabel = 'ATINS';
            badgeClass = 'bg-emerald-100 text-emerald-800';
          } else if (inProgress) {
            badgeLabel = 'IN PROGRES';
            badgeClass = colors.badge;
          } else {
            badgeLabel = 'BLOCAT';
            badgeClass = 'bg-zinc-100 text-zinc-500';
          }

          return (
            <div
              key={tier}
              className={`rounded-xl border p-5 ring-1 ${colors.bg} ${colors.ring}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className={`text-lg font-bold ${colors.text}`}>{tier}</h2>
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase ${badgeClass}`}
                    >
                      {badgeLabel}
                    </span>
                  </div>
                  <p className="mt-0.5 text-sm text-zinc-600">
                    Prag: {config.restaurants} restaurante active
                  </p>
                  <p className="mt-0.5 text-sm font-semibold text-zinc-900">
                    Bonus: €{(config.cents / 100).toLocaleString('ro-RO')}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">{config.perks}</p>
                </div>
              </div>

              {/* Progress bar — shown when not yet achieved */}
              {!achieved && (
                <div className="mt-3">
                  <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-200">
                    <div
                      className="h-full rounded-full bg-purple-500 transition-all duration-300"
                      style={{ width: `${progressPct}%` }}
                      role="progressbar"
                      aria-valuenow={restaurantCount}
                      aria-valuemax={config.restaurants}
                      aria-label={`Progres ${tier}`}
                    />
                  </div>
                  <p className="mt-1 text-xs text-zinc-500">
                    {restaurantCount}/{config.restaurants} restaurante
                    {progressPct > 0 && ` (${Math.round(progressPct)}%)`}
                  </p>
                </div>
              )}

              {/* Milestone info */}
              {milestone && (
                <div className="mt-3 rounded-md bg-emerald-100 px-3 py-2 text-xs text-emerald-800">
                  Acordat: {fmtDate(milestone.awarded_at)}
                  {milestone.paid_at
                    ? ` · Plătit: ${fmtDate(milestone.paid_at)}`
                    : ' · Plata in curs'}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
