// /parteneriat/leaderboard — public top-10 reselleri (anonymized unless opted-in).
//
// ANPC compliance (Legea 363/2007 + Legea 158/2008):
//   - No individual income amounts published.
//   - Only "X restaurante aduse" and ladder tier displayed.
//   - No "venit garantat" or specific earnings claims.
//
// Data updated daily by the bonus-monthly-calc-v3 cron.

import type { Metadata } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { marketingOgImageUrl } from '@/lib/seo-marketing';

export const dynamic = 'force-dynamic';
export const revalidate = 86400; // 24h cache fallback

const LEADERBOARD_URL = 'https://hirforyou.ro/parteneriat/leaderboard';
const LEADERBOARD_TITLE = 'Top reselleri HIR for You — Leaderboard partener';
const LEADERBOARD_DESC =
  'Clasamentul celor mai activi reselleri HIR for You. Transparență fără declarații de venit — doar restaurante aduse și treapta Ladder atinsă.';

export const metadata: Metadata = {
  title: LEADERBOARD_TITLE,
  description: LEADERBOARD_DESC,
  alternates: {
    canonical: LEADERBOARD_URL,
    languages: {
      'ro-RO': LEADERBOARD_URL,
      en: LEADERBOARD_URL,
      'x-default': LEADERBOARD_URL,
    },
  },
  openGraph: {
    title: LEADERBOARD_TITLE,
    description: LEADERBOARD_DESC,
    url: LEADERBOARD_URL,
    type: 'website',
    locale: 'ro_RO',
    images: [
      {
        url: marketingOgImageUrl({
          title: 'Top reselleri HIR for You',
          subtitle: 'Clasament actualizat zilnic — fără declarații de venit',
          variant: 'partner',
        }),
        width: 1200,
        height: 630,
        alt: 'Leaderboard reselleri HIR for You',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: LEADERBOARD_TITLE,
    description: LEADERBOARD_DESC,
    images: [
      marketingOgImageUrl({
        title: 'Top reselleri HIR for You',
        subtitle: 'Clasament actualizat zilnic — fără declarații de venit',
        variant: 'partner',
      }),
    ],
  },
  robots: { index: true, follow: true },
};

type LeaderboardRow = {
  rank: number;
  display_name: string;
  city: string | null;
  restaurant_count: number;
  top_tier: string | null;
  wave_label: string | null;
  is_anon: boolean;
};

const TIER_RANK: Record<string, number> = {
  DIAMOND: 5,
  PLATINUM: 4,
  GOLD: 3,
  SILVER: 2,
  BRONZE: 1,
};

const TIER_LABEL: Record<string, string> = {
  DIAMOND: 'Diamond',
  PLATINUM: 'Platinum',
  GOLD: 'Gold',
  SILVER: 'Silver',
  BRONZE: 'Bronze',
};

const WAVE_DISPLAY: Record<string, { label: string; color: string }> = {
  W0: { label: 'Pilot Founder', color: 'bg-amber-100 text-amber-800 border-amber-200' },
  W1: { label: 'Early Founder', color: 'bg-violet-100 text-violet-800 border-violet-200' },
  W2: { label: 'Core Wave', color: 'bg-blue-100 text-blue-800 border-blue-200' },
};

async function fetchLeaderboard(): Promise<LeaderboardRow[]> {
  // The v3 reseller tables (partner_referrals / partners / ladder_milestones)
  // are not in restaurant-web's generated supabase types — they are
  // platform-level and only typed for restaurant-admin. Cast through unknown
  // to access them safely from the public surface; queries are read-only.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = getSupabaseAdmin() as any;

  // Top 10 by active referrals count
  const { data: referralCounts, error: refError } = await admin
    .from('partner_referrals')
    .select('partner_id')
    .is('ended_at', null);

  if (refError || !referralCounts) return [];

  // Aggregate counts per partner
  const countMap: Record<string, number> = {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const r of referralCounts as any[]) {
    const pid = r.partner_id as string;
    countMap[pid] = (countMap[pid] ?? 0) + 1;
  }

  // Sort by count desc, take top 10
  const topPartnerIds = Object.entries(countMap)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([id]) => id);

  if (topPartnerIds.length === 0) return [];

  // Fetch partner info
  const { data: partners, error: pError } = await admin
    .from('partners')
    .select('id, name, status, wave_label, public_testimonial_optin')
    .in('id', topPartnerIds);

  if (pError || !partners) return [];

  // Try to get city from address field (v3 schema) — best-effort
  // We cast through unknown since the typed schema may not have these new columns yet
  const partnersWithCity = partners as unknown as Array<{
    id: string;
    name: string;
    status: string;
    wave_label: string | null;
    public_testimonial_optin: boolean | null;
    address?: string | null;
  }>;

  // Fetch highest ladder milestone per partner
  const { data: milestones } = await admin
    .from('ladder_milestones')
    .select('partner_id, tier_reached')
    .in('partner_id', topPartnerIds);

  const topTierByPartner: Record<string, string> = {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const m of (milestones ?? []) as any[]) {
    const pid = m.partner_id as string;
    const tier = m.tier_reached as string;
    const prev = topTierByPartner[pid];
    if (!prev || (TIER_RANK[tier] ?? 0) > (TIER_RANK[prev] ?? 0)) {
      topTierByPartner[pid] = tier;
    }
  }

  // Build leaderboard rows sorted by restaurant count
  const rows: LeaderboardRow[] = [];
  topPartnerIds.forEach((pid, idx) => {
    const p = partnersWithCity.find((x) => x.id === pid);
    if (!p) return;
    const optin = Boolean(p.public_testimonial_optin);
    const wave = p.wave_label ?? 'OPEN';
    const showWaveBadge = ['W0', 'W1', 'W2'].includes(wave);

    // Extract city from address (first comma-segment, if address present)
    let city: string | null = null;
    if (optin && p.address) {
      const parts = p.address.split(',');
      const last = parts[parts.length - 1]?.trim();
      if (last && last.length < 40) city = last;
    }

    rows.push({
      rank: idx + 1,
      display_name: optin ? (p.name ?? 'Reseller') : 'Reseller anonim',
      city: optin ? city : null,
      restaurant_count: countMap[pid] ?? 0,
      top_tier: topTierByPartner[pid] ?? null,
      wave_label: showWaveBadge ? wave : null,
      is_anon: !optin,
    });
  });

  return rows;
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-amber-400 text-base font-bold text-white shadow">
        1
      </span>
    );
  }
  if (rank === 2) {
    return (
      <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-zinc-400 text-base font-bold text-white shadow">
        2
      </span>
    );
  }
  if (rank === 3) {
    return (
      <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-amber-700 text-base font-bold text-white shadow">
        3
      </span>
    );
  }
  return (
    <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-zinc-100 text-base font-semibold text-zinc-600">
      {rank}
    </span>
  );
}

function TierBadge({ tier }: { tier: string }) {
  const colors: Record<string, string> = {
    DIAMOND: 'bg-cyan-100 text-cyan-800 border border-cyan-200',
    PLATINUM: 'bg-purple-100 text-purple-800 border border-purple-200',
    GOLD: 'bg-yellow-100 text-yellow-800 border border-yellow-200',
    SILVER: 'bg-zinc-100 text-zinc-700 border border-zinc-300',
    BRONZE: 'bg-orange-100 text-orange-800 border border-orange-200',
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${colors[tier] ?? 'bg-zinc-100 text-zinc-600'}`}
    >
      {TIER_LABEL[tier] ?? tier}
    </span>
  );
}

function WaveBadge({ wave }: { wave: string }) {
  const info = WAVE_DISPLAY[wave];
  if (!info) return null;
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${info.color}`}
    >
      {info.label}
    </span>
  );
}

export default async function LeaderboardPage() {
  const rows = await fetchLeaderboard();

  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-900">
      {/* Hero */}
      <section className="mx-auto max-w-3xl px-4 pb-8 pt-12 sm:pt-16 text-center">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-800">
          <span className="inline-block h-2 w-2 rounded-full bg-violet-500" aria-hidden />
          Actualizat zilnic
        </div>
        <h1 className="text-3xl font-bold leading-tight text-zinc-900 sm:text-4xl">
          Top reselleri HIR for You
        </h1>
        <p className="mt-3 text-sm text-zinc-600 sm:text-base">
          Reselleri activi, clasați după numărul de restaurante aduse pe platformă.
          Transparență completă — fără declarații de venit.
        </p>
      </section>

      {/* Leaderboard table */}
      <section className="mx-auto max-w-3xl px-4 pb-12">
        {rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-16 text-center">
            <p className="text-sm font-medium text-zinc-600">
              Clasamentul se va afișa odată ce primii reselleri aduc restaurante.
            </p>
            <a
              href="/parteneriat"
              className="mt-4 inline-flex items-center justify-center rounded-full bg-violet-700 px-5 py-2 text-sm font-semibold text-white hover:bg-violet-800"
            >
              Devino primul reseller
            </a>
          </div>
        ) : (
          <ol className="flex flex-col gap-3" aria-label="Clasament reselleri">
            {rows.map((row) => {
              const isTop3 = row.rank <= 3;
              const cardBg =
                row.rank === 1
                  ? 'bg-gradient-to-r from-amber-50 to-white border-amber-200'
                  : row.rank === 2
                    ? 'bg-gradient-to-r from-zinc-100 to-white border-zinc-300'
                    : row.rank === 3
                      ? 'bg-gradient-to-r from-orange-50 to-white border-orange-200'
                      : 'bg-white border-zinc-200';

              return (
                <li
                  key={row.rank}
                  className={`flex items-center gap-4 rounded-2xl border px-4 py-4 shadow-sm ${cardBg}`}
                >
                  <RankBadge rank={row.rank} />

                  {/* Name + city */}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`font-semibold ${isTop3 ? 'text-base text-zinc-900' : 'text-sm text-zinc-800'} ${row.is_anon ? 'italic text-zinc-500' : ''}`}
                      >
                        {row.display_name}
                      </span>
                      {row.wave_label && <WaveBadge wave={row.wave_label} />}
                      {row.top_tier && <TierBadge tier={row.top_tier} />}
                    </div>
                    {row.city && (
                      <p className="mt-0.5 text-xs text-zinc-500">{row.city}</p>
                    )}
                  </div>

                  {/* Restaurant count */}
                  <div className="text-right flex-shrink-0">
                    <div
                      className={`tabular-nums font-bold ${isTop3 ? 'text-xl text-zinc-900' : 'text-base text-zinc-700'}`}
                    >
                      {row.restaurant_count}
                    </div>
                    <div className="text-xs text-zinc-500">restaurante</div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}

        {/* Legend */}
        <p className="mt-6 text-center text-xs text-zinc-500">
          Datele sunt actualizate zilnic. Resellerii cu opt-in public sunt afișați cu
          nume real; ceilalți sunt anonimizați. Nu sunt publicate sume de venit
          individual — clasamentul arată exclusiv activitatea comercială.
        </p>

        {/* CTA */}
        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <a
            href="/parteneriat"
            className="inline-flex items-center justify-center rounded-full bg-violet-700 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-violet-800"
          >
            Devino reseller
          </a>
          <a
            href="/parteneriat/inscriere"
            className="inline-flex items-center justify-center rounded-full border border-zinc-300 bg-white px-6 py-3 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
          >
            Inscrie-te acum
          </a>
        </div>
      </section>
    </main>
  );
}
