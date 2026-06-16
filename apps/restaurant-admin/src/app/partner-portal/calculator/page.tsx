'use client';

// /partner-portal/calculator — earnings simulator (conversion tool)
//
// Client component: sliders update live output without a round-trip.
//
// Premium polish (2026-06-16):
//   - state persists in localStorage (key `hir-partner-calculator-v1`),
//     so coming back from the marketing kit doesn't reset your inputs;
//   - state ALSO syncs to ?my=…&subs=…&avgRest=…&wave=… URL params so
//     the partner can share a deep-link of their projection with a
//     prospect / their manager;
//   - sliders use Tailwind range with a custom thumb (focus-visible);
//   - live preview adds a 3-year projection alongside year 1 / monthly.
//
// Warm RO microcopy throughout — every label is reassuring, never
// mechanical.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Share2, RotateCcw } from 'lucide-react';
import {
  WAVE_BONUSES,
  LADDER_TIERS,
  type WaveLabel,
  type LadderTier,
} from '@/lib/partner-v3-constants';

const ORDERS_PER_DAY = 30;
const EUR_PER_ORDER = 0.54;
const DIRECT_Y1_BASE = 25; // %
const OVERRIDE_Y1_BASE = 10; // %
const STORAGE_KEY = 'hir-partner-calculator-v1';

type Wave = WaveLabel;

type State = {
  myRest: number;
  mySubs: number;
  avgRest: number;
  wave: Wave;
};

const DEFAULTS: State = {
  myRest: 5,
  mySubs: 2,
  avgRest: 3,
  wave: 'OPEN',
};

function isWave(v: string): v is Wave {
  return v === 'W0' || v === 'W1' || v === 'W2' || v === 'W3' || v === 'OPEN';
}

function clampInt(v: unknown, lo: number, hi: number, fallback: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

function readFromUrl(sp: URLSearchParams): Partial<State> {
  const out: Partial<State> = {};
  if (sp.has('my')) out.myRest = clampInt(sp.get('my'), 1, 30, DEFAULTS.myRest);
  if (sp.has('subs')) out.mySubs = clampInt(sp.get('subs'), 0, 10, DEFAULTS.mySubs);
  if (sp.has('avgRest'))
    out.avgRest = clampInt(sp.get('avgRest'), 1, 10, DEFAULTS.avgRest);
  const w = sp.get('wave');
  if (w && isWave(w)) out.wave = w;
  return out;
}

function readFromStorage(): Partial<State> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Partial<State>;
    const out: Partial<State> = {};
    if (typeof parsed.myRest === 'number')
      out.myRest = clampInt(parsed.myRest, 1, 30, DEFAULTS.myRest);
    if (typeof parsed.mySubs === 'number')
      out.mySubs = clampInt(parsed.mySubs, 0, 10, DEFAULTS.mySubs);
    if (typeof parsed.avgRest === 'number')
      out.avgRest = clampInt(parsed.avgRest, 1, 10, DEFAULTS.avgRest);
    if (typeof parsed.wave === 'string' && isWave(parsed.wave)) out.wave = parsed.wave;
    return out;
  } catch {
    return {};
  }
}

function calcEarnings(s: State) {
  const wb = WAVE_BONUSES[s.wave];

  const directPct = (DIRECT_Y1_BASE + wb.direct_y1) / 100;
  const directY1 =
    s.myRest * ORDERS_PER_DAY * EUR_PER_ORDER * directPct * 365;

  const overridePct = (OVERRIDE_Y1_BASE + wb.override_y1) / 100;
  const overrideY1 =
    s.mySubs * s.avgRest * ORDERS_PER_DAY * EUR_PER_ORDER * overridePct * 365;

  const totalY1 = directY1 + overrideY1;

  // 3-year projection: Y1 full + 2 recurring years on the recurring pct.
  const directRecurringPct =
    (DIRECT_Y1_BASE - 5 + wb.direct_recurring) / 100; // recurring base = 20%
  const overrideRecurringPct =
    (OVERRIDE_Y1_BASE - 4 + wb.override_recurring) / 100; // recurring base = 6%
  const recurringPerYear =
    s.myRest * ORDERS_PER_DAY * EUR_PER_ORDER * directRecurringPct * 365 +
    s.mySubs * s.avgRest * ORDERS_PER_DAY * EUR_PER_ORDER * overrideRecurringPct * 365;
  const total3y = totalY1 + recurringPerYear * 2;

  // Next ladder tier
  const totalRest = s.myRest + s.mySubs * s.avgRest;
  const ladderKeys: LadderTier[] = ['BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'DIAMOND'];
  let nextTier:
    | ((typeof LADDER_TIERS)[LadderTier] & { name: LadderTier })
    | null = null;
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
    total3y,
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

const WAVE_LABELS: Record<Wave, string> = {
  W0: 'Pilot Founders — +5%/5% pe viață',
  W1: 'Early Founders — +3%/3% pe viață',
  W2: 'Core — +2% override pe viață',
  W3: 'Scale — standard',
  OPEN: 'Open (standard)',
};

export default function CalculatorPage() {
  // SSR-safe initial state — we deliberately start with the spec defaults
  // so server and client render identically (no hydration mismatch).
  // After mount, a one-shot effect rehydrates from URL → localStorage.
  // URL wins because a shared link must reproduce the projection exactly.
  const [state, setState] = useState<State>(DEFAULTS);
  const [shareStatus, setShareStatus] = useState<'idle' | 'copied'>('idle');
  const hydrated = useRef(false);

  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;
    try {
      const sp = new URLSearchParams(window.location.search);
      const fromUrl = readFromUrl(sp);
      const fromStore = readFromStorage();
      const merged: State = {
        myRest: fromUrl.myRest ?? fromStore.myRest ?? DEFAULTS.myRest,
        mySubs: fromUrl.mySubs ?? fromStore.mySubs ?? DEFAULTS.mySubs,
        avgRest: fromUrl.avgRest ?? fromStore.avgRest ?? DEFAULTS.avgRest,
        wave: fromUrl.wave ?? fromStore.wave ?? DEFAULTS.wave,
      };
      // Skip the set if it already equals DEFAULTS (avoid an extra re-render).
      if (
        merged.myRest !== DEFAULTS.myRest ||
        merged.mySubs !== DEFAULTS.mySubs ||
        merged.avgRest !== DEFAULTS.avgRest ||
        merged.wave !== DEFAULTS.wave
      ) {
        setState(merged);
      }
    } catch {
      /* sandboxed / parse error — stick with defaults */
    }
  }, []);

  // Persist to localStorage + URL on every change, but only AFTER the
  // first hydration pass — otherwise the SSR-default state (DEFAULTS)
  // would wipe a prior persisted projection before useEffect-above gets
  // a chance to restore it.
  useEffect(() => {
    if (!hydrated.current) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* quota / private-mode — ignore */
    }
    try {
      const sp = new URLSearchParams(window.location.search);
      sp.set('my', String(state.myRest));
      sp.set('subs', String(state.mySubs));
      sp.set('avgRest', String(state.avgRest));
      sp.set('wave', state.wave);
      const next = `${window.location.pathname}?${sp.toString()}`;
      window.history.replaceState(null, '', next);
    } catch {
      /* sandboxed contexts — ignore */
    }
  }, [state]);

  const result = useMemo(() => calcEarnings(state), [state]);

  const progressPct = result.nextTier
    ? Math.min(100, (result.totalRest / result.nextTier.restaurants) * 100)
    : 100;

  async function handleShare() {
    if (typeof window === 'undefined') return;
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({
          title: 'Câștigurile mele estimate cu HIR',
          text: `Cu ${state.myRest} restaurante aduse + ${state.mySubs} sub-resellers, câștig estimat ~€${fmtEur(result.totalY1)} pe an cu HIR.`,
          url,
        });
        return;
      }
    } catch {
      /* user cancelled or share failed → fall back to clipboard */
    }
    try {
      await navigator.clipboard.writeText(url);
      setShareStatus('copied');
      setTimeout(() => setShareStatus('idle'), 1800);
    } catch {
      /* clipboard blocked — ignore */
    }
  }

  function handleReset() {
    setState(DEFAULTS);
  }

  return (
    <div className="flex flex-col gap-6 pb-20 lg:pb-0">
      <header className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900 sm:text-2xl">
          Calculator de câștiguri
        </h1>
        <p className="text-sm text-zinc-600">
          Mută cursoarele și vezi imediat cât poți câștiga lunar, anul 1 și pe 3
          ani. Calculul folosește mediile reale ale platformei (30 comenzi/zi,
          0,54&nbsp;€/comandă). Setările tale se păstrează automat.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Inputs */}
        <div className="flex flex-col gap-6 rounded-2xl border border-zinc-200 bg-white p-5 sm:p-6">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-zinc-900">
              Parametrii tăi
            </h2>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleReset}
                className="inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
              >
                <RotateCcw className="h-3 w-3" aria-hidden />
                Resetează
              </button>
              <button
                type="button"
                onClick={handleShare}
                className="inline-flex items-center gap-1 rounded-md bg-purple-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-purple-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-1"
              >
                <Share2 className="h-3 w-3" aria-hidden />
                {shareStatus === 'copied' ? 'Link copiat!' : 'Distribuie'}
              </button>
            </div>
          </div>

          <SliderField
            id="my-rest"
            label="Vendori pe care îi aduci tu / lună"
            value={state.myRest}
            min={1}
            max={30}
            onChange={(v) => setState({ ...state, myRest: v })}
            hint="Restaurante / farmacii / minimarkete pe care le înrolezi personal."
          />

          <SliderField
            id="my-subs"
            label="Sub-reselleri din echipa ta"
            value={state.mySubs}
            min={0}
            max={10}
            onChange={(v) => setState({ ...state, mySubs: v })}
            hint="Persoane invitate de tine — primești 10% Y1 din comisionul lor."
          />

          <SliderField
            id="avg-rest"
            label="Vendori medii per sub-reseller / lună"
            value={state.avgRest}
            min={1}
            max={10}
            onChange={(v) => setState({ ...state, avgRest: v })}
            disabled={state.mySubs === 0}
            hint="Câți vendori aduce, în medie, fiecare sub-reseller din echipa ta."
          />

          <fieldset>
            <legend className="mb-2 block text-xs font-medium text-zinc-700">
              Wave-ul tău
            </legend>
            <div className="flex flex-col gap-1.5">
              {(Object.keys(WAVE_LABELS) as Wave[]).map((w) => (
                <label
                  key={w}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-sm transition-colors hover:bg-zinc-50"
                >
                  <input
                    type="radio"
                    name="wave"
                    value={w}
                    checked={state.wave === w}
                    onChange={() => setState({ ...state, wave: w })}
                    className="accent-purple-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-1"
                  />
                  <span
                    className={
                      state.wave === w
                        ? 'font-medium text-zinc-900'
                        : 'text-zinc-600'
                    }
                  >
                    {WAVE_LABELS[w]}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        </div>

        {/* Output */}
        <div className="flex flex-col gap-4">
          {/* Headline number */}
          <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 via-emerald-50 to-white p-6">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
              Câștig estimat în primul an
            </p>
            <p className="mt-2 text-5xl font-bold tabular-nums text-emerald-700">
              €{fmtEur(result.totalY1)}
            </p>
            <p className="mt-1 text-sm text-emerald-700/90">
              ≈{' '}
              <span className="font-semibold">
                €{fmtEur(result.totalMonthly)}/lună
              </span>{' '}
              · pe 3 ani: ~€{fmtEur(result.total3y)}
            </p>
          </div>

          {/* Breakdown */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-zinc-200 bg-white p-4">
              <p className="text-xs text-zinc-500">Direct (anul 1)</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-zinc-900">
                €{fmtEur(result.directY1)}
              </p>
              <p className="mt-0.5 text-xs text-zinc-400">
                {state.myRest} vendori × {DIRECT_Y1_BASE + WAVE_BONUSES[state.wave].direct_y1}% Y1
              </p>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-white p-4">
              <p className="text-xs text-zinc-500">Override echipă (anul 1)</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-zinc-900">
                €{fmtEur(result.overrideY1)}
              </p>
              <p className="mt-0.5 text-xs text-zinc-400">
                {state.mySubs} subs × {state.avgRest} vend ×{' '}
                {OVERRIDE_Y1_BASE + WAVE_BONUSES[state.wave].override_y1}%
              </p>
            </div>
          </div>

          {/* Ladder progress */}
          <div className="rounded-xl border border-zinc-200 bg-white p-4">
            <p className="mb-2 text-xs font-medium text-zinc-700">
              Următorul prag Ladder
            </p>
            <p className="text-sm text-zinc-600">
              Vendori totali:{' '}
              <span className="font-semibold text-zinc-900">
                {result.totalRest}
              </span>
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
                  {result.totalRest}/{result.nextTier.restaurants} vendori pentru{' '}
                  <span className="font-medium text-zinc-700">
                    {result.nextTier.name} — bonus €
                    {fmtEur(result.nextTier.cents / 100)}
                  </span>
                </p>
              </>
            ) : (
              <p className="mt-1.5 text-xs font-medium text-emerald-700">
                Diamond atins — felicitări!
              </p>
            )}
          </div>

          <p className="text-xs leading-relaxed text-zinc-400">
            Calcul: vendori × 30 comenzi/zi × 0,54&nbsp;€/comandă × procentul tău
            × 365 zile. Estimare bazată pe media platformei; rezultatele reale
            depind de tipul vendorilor, oraș și sezonalitate.
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
  hint,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <div className={disabled ? 'opacity-40' : ''}>
      <label
        htmlFor={id}
        className="mb-1 flex items-center justify-between text-xs font-medium text-zinc-700"
      >
        <span>{label}</span>
        <span className="rounded-md bg-purple-50 px-2 py-0.5 font-semibold tabular-nums text-purple-700">
          {value}
        </span>
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-purple-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-1"
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-describedby={hint ? `${id}-hint` : undefined}
      />
      <div className="mt-0.5 flex justify-between text-[10px] text-zinc-400">
        <span>{min}</span>
        <span>{max}</span>
      </div>
      {hint ? (
        <p id={`${id}-hint`} className="mt-1 text-[11px] text-zinc-500">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
