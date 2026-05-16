'use client';

// /partner-portal/calculator — earnings simulator (conversion tool)
// Client component: sliders update live output without a round-trip.

import { useState } from 'react';
import { WAVE_BONUSES, LADDER_TIERS, type WaveLabel, type LadderTier } from '@/lib/partner-v3-constants';

const ORDERS_PER_DAY = 30;
const EUR_PER_ORDER = 0.54;
const DIRECT_Y1_BASE = 25; // %
const OVERRIDE_Y1_BASE = 10; // %

function calcEarnings(
  myRestaurants: number,
  mySubResellers: number,
  avgRestPerSub: number,
  wave: WaveLabel,
) {
  const wb = WAVE_BONUSES[wave];

  // Direct Y1 earnings (annual)
  const directPct = (DIRECT_Y1_BASE + wb.direct_y1) / 100;
  const directY1 =
    myRestaurants * ORDERS_PER_DAY * EUR_PER_ORDER * directPct * 365;

  // Override Y1 earnings (annual) — on sub-resellers' restaurants
  const overridePct = (OVERRIDE_Y1_BASE + wb.override_y1) / 100;
  const overrideY1 =
    mySubResellers * avgRestPerSub * ORDERS_PER_DAY * EUR_PER_ORDER * overridePct * 365;

  const totalY1 = directY1 + overrideY1;

  // Next ladder tier
  const totalRest = myRestaurants + mySubResellers * avgRestPerSub;
  const ladderKeys: LadderTier[] = ['BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'DIAMOND'];
  let nextTier: (typeof LADDER_TIERS)[LadderTier] & { name: LadderTier } | null = null;
  for (const key of ladderKeys) {
    if (totalRest < LADDER_TIERS[key].restaurants) {
      nextTier = { ...LADDER_TIERS[key], name: key };
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
  return n.toLocaleString('ro-RO', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

const WAVE_LABELS: Record<WaveLabel, string> = {
  W0: 'Wave 0 — Pilot Founders (+5%/5%)',
  W1: 'Wave 1 — Early Founders (+3%/3%)',
  W2: 'Wave 2 — Core (+2% override)',
  W3: 'Wave 3 — Scale',
  OPEN: 'Open (standard)',
};

export default function CalculatorPage() {
  const [myRest, setMyRest] = useState(5);
  const [mySubs, setMySubs] = useState(2);
  const [avgRest, setAvgRest] = useState(3);
  const [wave, setWave] = useState<WaveLabel>('OPEN');

  const result = calcEarnings(myRest, mySubs, avgRest, wave);

  const progressPct = result.nextTier
    ? Math.min(100, (result.totalRest / result.nextTier.restaurants) * 100)
    : 100;

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">Calculator câștiguri</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Ajustează parametrii și vezi în timp real cât poți câștiga cu programul HIR.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Inputs */}
        <div className="flex flex-col gap-6 rounded-lg border border-zinc-200 bg-white p-6">
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
            <legend className="mb-2 block text-xs font-medium text-zinc-700">
              Wave-ul tău
            </legend>
            <div className="flex flex-col gap-1.5">
              {(Object.keys(WAVE_LABELS) as WaveLabel[]).map((w) => (
                <label key={w} className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="wave"
                    value={w}
                    checked={wave === w}
                    onChange={() => setWave(w)}
                    className="accent-purple-600"
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
          {/* Big numbers */}
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-6">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
              Câștig estimat anual
            </p>
            <p className="mt-2 text-5xl font-bold tabular-nums text-emerald-700">
              €{fmtEur(result.totalY1)}
            </p>
            <p className="mt-1 text-sm text-emerald-600">
              adică{' '}
              <span className="font-semibold">€{fmtEur(result.totalMonthly)}/lună</span>
            </p>
          </div>

          {/* Breakdown */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-zinc-200 bg-white p-4">
              <p className="text-xs text-zinc-500">Comision direct Y1</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-zinc-900">
                €{fmtEur(result.directY1)}
              </p>
              <p className="mt-0.5 text-xs text-zinc-400">
                {myRest} rest × {DIRECT_Y1_BASE + WAVE_BONUSES[wave].direct_y1}% Y1
              </p>
            </div>
            <div className="rounded-lg border border-zinc-200 bg-white p-4">
              <p className="text-xs text-zinc-500">Override echipă Y1</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-zinc-900">
                €{fmtEur(result.overrideY1)}
              </p>
              <p className="mt-0.5 text-xs text-zinc-400">
                {mySubs} subs × {avgRest} rest × {OVERRIDE_Y1_BASE + WAVE_BONUSES[wave].override_y1}%
              </p>
            </div>
          </div>

          {/* Ladder progress */}
          <div className="rounded-lg border border-zinc-200 bg-white p-4">
            <p className="mb-2 text-xs font-medium text-zinc-700">Progres Ladder</p>
            <p className="text-sm text-zinc-600">
              Restaurante totale:{' '}
              <span className="font-semibold text-zinc-900">{result.totalRest}</span>
            </p>
            {result.nextTier ? (
              <>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-zinc-100">
                  <div
                    className="h-full rounded-full bg-purple-500 transition-all duration-300"
                    style={{ width: `${progressPct}%` }}
                    aria-valuenow={result.totalRest}
                    aria-valuemax={result.nextTier.restaurants}
                    role="progressbar"
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
                Diamond atins — felicitari!
              </p>
            )}
          </div>

          <p className="text-xs text-zinc-400">
            Calcul: restaurante × 30 comenzi/zi × €0.54/comandă × comision% × 365 zile.
            Estimare orientativă bazată pe media pietei. Rezultatele reale pot varia.
          </p>
        </div>
      </div>
    </div>
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
      <label htmlFor={id} className="mb-1 flex items-center justify-between text-xs font-medium text-zinc-700">
        <span>{label}</span>
        <span className="tabular-nums text-purple-700 font-semibold">{value}</span>
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-purple-600"
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
      />
      <div className="mt-0.5 flex justify-between text-[10px] text-zinc-400">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}
