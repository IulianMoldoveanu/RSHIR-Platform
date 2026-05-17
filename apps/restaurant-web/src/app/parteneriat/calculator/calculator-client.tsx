'use client';

// /parteneriat/calculator — public earnings simulator (conversion tool).
//
// Mirrors apps/restaurant-admin/src/app/partner-portal/calculator/page.tsx
// but for the public-facing /parteneriat funnel: no auth, ends with a CTA
// to /parteneriat/inscriere.
//
// ANPC compliance: "estimare orientativă", "rezultatele variază în funcție
// de efort", no income guarantees in the page copy.

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, ChevronLeft } from 'lucide-react';

// ─── Reseller program constants (mirror partner-v3-constants.ts) ─────────────
// Public surface — duplicated here so apps/restaurant-web doesn't need to
// import from apps/restaurant-admin. Keep these in sync if v3 numbers change.

type WaveLabel = 'W0' | 'W1' | 'W2' | 'W3' | 'OPEN';

const WAVE_BONUSES: Record<
  WaveLabel,
  { direct_y1: number; override_y1: number }
> = {
  W0: { direct_y1: 5, override_y1: 0 },
  W1: { direct_y1: 3, override_y1: 0 },
  W2: { direct_y1: 0, override_y1: 2 },
  W3: { direct_y1: 0, override_y1: 0 },
  OPEN: { direct_y1: 0, override_y1: 0 },
};

type LadderTier = 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM' | 'DIAMOND';
const LADDER_TIERS: Record<LadderTier, { restaurants: number; cents: number }> = {
  BRONZE: { restaurants: 5, cents: 35000 },
  SILVER: { restaurants: 15, cents: 100000 },
  GOLD: { restaurants: 30, cents: 300000 },
  PLATINUM: { restaurants: 50, cents: 700000 },
  DIAMOND: { restaurants: 100, cents: 2000000 },
};

const ORDERS_PER_DAY = 30;
const EUR_PER_ORDER = 0.54;
const DIRECT_Y1_BASE = 25;
const OVERRIDE_Y1_BASE = 10;

const WAVE_LABELS: Record<WaveLabel, string> = {
  W0: 'Wave 0 — Pilot Founders (+5%/5%)',
  W1: 'Wave 1 — Early Founders (+3%/3%)',
  W2: 'Wave 2 — Core (+2% override)',
  W3: 'Wave 3 — Scale',
  OPEN: 'Open (standard)',
};

function calcEarnings(
  myRestaurants: number,
  mySubResellers: number,
  avgRestPerSub: number,
  wave: WaveLabel,
) {
  const wb = WAVE_BONUSES[wave];
  const directPct = (DIRECT_Y1_BASE + wb.direct_y1) / 100;
  const directY1 = myRestaurants * ORDERS_PER_DAY * EUR_PER_ORDER * directPct * 365;

  const overridePct = (OVERRIDE_Y1_BASE + wb.override_y1) / 100;
  const overrideY1 =
    mySubResellers * avgRestPerSub * ORDERS_PER_DAY * EUR_PER_ORDER * overridePct * 365;

  const totalY1 = directY1 + overrideY1;
  const totalRest = myRestaurants + mySubResellers * avgRestPerSub;

  const ladderKeys: LadderTier[] = ['BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'DIAMOND'];
  let nextTier: { name: LadderTier; restaurants: number; cents: number } | null = null;
  for (const key of ladderKeys) {
    if (totalRest < LADDER_TIERS[key].restaurants) {
      nextTier = { name: key, ...LADDER_TIERS[key] };
      break;
    }
  }

  return {
    directY1,
    overrideY1,
    totalY1,
    totalMonthly: totalY1 / 12,
    totalRest,
    nextTier,
  };
}

function fmtEur(n: number): string {
  return n.toLocaleString('ro-RO', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export default function CalculatorClient() {
  const [myRest, setMyRest] = useState(5);
  const [mySubs, setMySubs] = useState(2);
  const [avgRest, setAvgRest] = useState(3);
  const [wave, setWave] = useState<WaveLabel>('OPEN');

  const result = calcEarnings(myRest, mySubs, avgRest, wave);
  const progressPct = result.nextTier
    ? Math.min(100, (result.totalRest / result.nextTier.restaurants) * 100)
    : 100;

  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-10 text-zinc-900">
      <div className="mx-auto max-w-4xl">
        <Link
          href="/parteneriat"
          className="inline-flex items-center gap-1 text-xs font-medium text-zinc-500 transition-colors hover:text-zinc-800"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Înapoi la program
        </Link>

        <header className="mt-4 mb-8">
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl">
            Calculator câștiguri reseller
          </h1>
          <p className="mt-2 text-sm text-zinc-600">
            Ajustează parametrii și vezi în timp real o estimare orientativă a câștigurilor.
            Rezultatele variază în funcție de efort, rețea și piața locală.
          </p>
        </header>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Inputs */}
          <div className="flex flex-col gap-6 rounded-2xl border border-zinc-200 bg-white p-6">
            <h2 className="text-sm font-semibold text-zinc-900">Parametrii tăi</h2>

            <SliderField
              id="my-rest"
              label="Restaurante aduse de tine / lună"
              value={myRest}
              min={1}
              max={30}
              onChange={setMyRest}
            />
            <SliderField
              id="my-subs"
              label="Sub-reselleri în echipa ta"
              value={mySubs}
              min={0}
              max={10}
              onChange={setMySubs}
            />
            <SliderField
              id="avg-rest"
              label="Restaurante medii per sub-reseller / lună"
              value={avgRest}
              min={1}
              max={10}
              onChange={setAvgRest}
              disabled={mySubs === 0}
            />

            <fieldset>
              <legend className="mb-2 block text-xs font-medium text-zinc-700">Wave-ul tău</legend>
              <div className="flex flex-col gap-1.5">
                {(Object.keys(WAVE_LABELS) as WaveLabel[]).map((w) => (
                  <label key={w} className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="wave"
                      value={w}
                      checked={wave === w}
                      onChange={() => setWave(w)}
                      className="accent-violet-700"
                    />
                    <span className={wave === w ? 'font-medium text-zinc-900' : 'text-zinc-600'}>
                      {WAVE_LABELS[w]}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          </div>

          {/* Output */}
          <div className="flex flex-col gap-4">
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                Estimare câștig anual
              </p>
              <p className="mt-2 text-5xl font-bold tabular-nums text-emerald-700">
                €{fmtEur(result.totalY1)}
              </p>
              <p className="mt-1 text-sm text-emerald-700">
                adică ~<span className="font-semibold">€{fmtEur(result.totalMonthly)}/lună</span>
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-zinc-200 bg-white p-4">
                <p className="text-xs text-zinc-500">Comision direct Y1</p>
                <p className="mt-1 text-xl font-semibold tabular-nums text-zinc-900">
                  €{fmtEur(result.directY1)}
                </p>
                <p className="mt-0.5 text-[11px] text-zinc-400">
                  {myRest} rest × {DIRECT_Y1_BASE + WAVE_BONUSES[wave].direct_y1}% Y1
                </p>
              </div>
              <div className="rounded-xl border border-zinc-200 bg-white p-4">
                <p className="text-xs text-zinc-500">Override echipă Y1</p>
                <p className="mt-1 text-xl font-semibold tabular-nums text-zinc-900">
                  €{fmtEur(result.overrideY1)}
                </p>
                <p className="mt-0.5 text-[11px] text-zinc-400">
                  {mySubs} subs × {avgRest} rest ×{' '}
                  {OVERRIDE_Y1_BASE + WAVE_BONUSES[wave].override_y1}%
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-zinc-200 bg-white p-4">
              <p className="mb-2 text-xs font-medium text-zinc-700">Progres Ladder</p>
              <p className="text-sm text-zinc-600">
                Restaurante totale:{' '}
                <span className="font-semibold text-zinc-900">{result.totalRest}</span>
              </p>
              {result.nextTier ? (
                <>
                  <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-zinc-100">
                    <div
                      className="h-full rounded-full bg-violet-600 transition-all duration-300"
                      style={{ width: `${progressPct}%` }}
                      role="progressbar"
                      aria-valuenow={result.totalRest}
                      aria-valuemax={result.nextTier.restaurants}
                      aria-label={`Progres spre ${result.nextTier.name}`}
                    />
                  </div>
                  <p className="mt-1.5 text-xs text-zinc-500">
                    {result.totalRest}/{result.nextTier.restaurants} rest pentru{' '}
                    <span className="font-medium text-zinc-700">
                      {result.nextTier.name} — €{fmtEur(result.nextTier.cents / 100)} bonus
                    </span>
                  </p>
                </>
              ) : (
                <p className="mt-1.5 text-xs font-medium text-emerald-700">
                  Diamond atins — felicitări!
                </p>
              )}
            </div>

            <Link
              href="/parteneriat/inscriere"
              className="mt-2 inline-flex items-center justify-center gap-2 rounded-full bg-violet-700 px-6 py-3 text-base font-semibold text-white shadow-sm transition-colors hover:bg-violet-800"
            >
              Înscrie-te în program
              <ArrowRight className="h-5 w-5" aria-hidden />
            </Link>

            <p className="text-[11px] leading-relaxed text-zinc-400">
              Calcul: restaurante × 30 comenzi/zi × €0.54/comandă × comision% × 365 zile. Estimare
              orientativă bazată pe medii de piață. Câștigurile reale variază în funcție de efort,
              activitatea restaurantelor aduse și termenii finali confirmați la semnarea
              contractului.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}

function SliderField({
  id,
  label,
  value,
  min,
  max,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className={disabled ? 'opacity-40' : ''}>
      <label
        htmlFor={id}
        className="mb-1 flex items-center justify-between text-xs font-medium text-zinc-700"
      >
        <span>{label}</span>
        <span className="tabular-nums font-semibold text-violet-700">{value}</span>
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-violet-700"
      />
      <div className="mt-0.5 flex justify-between text-[10px] text-zinc-400">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}
