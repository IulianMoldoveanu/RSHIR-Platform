// Hero block at the top of /partner-portal. Renders the warm welcome,
// tier badge, wave label, and a glance line that summarises the partner's
// state in one sentence.
//
// Pure presentational, server-safe (no hooks).

type Tier = 'BASE' | 'AFFILIATE' | 'PARTNER' | 'PREMIER' | string;

const TIER_TONE: Record<Tier, string> = {
  BASE: 'bg-zinc-100 text-zinc-700 ring-zinc-200',
  AFFILIATE: 'bg-amber-100 text-amber-800 ring-amber-200',
  PARTNER: 'bg-purple-100 text-purple-800 ring-purple-200',
  PREMIER: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
};

const TIER_LABEL: Record<Tier, string> = {
  BASE: 'Bază',
  AFFILIATE: 'Afiliat',
  PARTNER: 'Partener',
  PREMIER: 'Premier',
};

const WAVE_TONE: Record<string, string> = {
  W0: 'bg-rose-100 text-rose-800 ring-rose-200',
  W1: 'bg-orange-100 text-orange-800 ring-orange-200',
  W2: 'bg-indigo-100 text-indigo-800 ring-indigo-200',
  W3: 'bg-sky-100 text-sky-800 ring-sky-200',
  OPEN: 'bg-zinc-100 text-zinc-700 ring-zinc-200',
};

export type PortalHeroProps = {
  partnerName: string;
  defaultCommissionPct: number;
  tier?: Tier | null;
  wave?: string | null;
  /** Short one-line summary, e.g. "5 vendori activi · 3.420 RON luna trecută". */
  glanceLine?: string;
};

export function PortalHero({
  partnerName,
  defaultCommissionPct,
  tier,
  wave,
  glanceLine,
}: PortalHeroProps) {
  const tierKey = (tier ?? 'BASE') as Tier;
  const tierTone = TIER_TONE[tierKey] ?? TIER_TONE.BASE;
  const tierLabel = TIER_LABEL[tierKey] ?? String(tier ?? '');
  const waveKey = String(wave ?? 'OPEN').toUpperCase();
  const waveTone = WAVE_TONE[waveKey] ?? WAVE_TONE.OPEN;

  return (
    <header
      aria-label="Sumar partener"
      className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-gradient-to-br from-white via-white to-purple-50/40 p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900 sm:text-2xl">
          Bun venit, {partnerName}
        </h1>
        {tier ? (
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ring-1 ring-inset ${tierTone}`}
          >
            {tierLabel}
          </span>
        ) : null}
        {wave && waveKey !== 'OPEN' ? (
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ring-1 ring-inset ${waveTone}`}
          >
            {waveKey}
          </span>
        ) : null}
      </div>
      <p className="text-sm text-zinc-600">
        Câștigi{' '}
        <span className="font-semibold text-zinc-900">
          {defaultCommissionPct.toFixed(0)}%
        </span>{' '}
        din fiecare comandă livrată pe vendorii pe care îi referi. Distribuie
        linkul, urmărește pipeline-ul, ridică-ți tier-ul.
      </p>
      {glanceLine ? (
        <p className="text-xs text-zinc-500">{glanceLine}</p>
      ) : null}
    </header>
  );
}
