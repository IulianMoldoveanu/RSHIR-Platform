'use client';

/**
 * ROI Calculator widget — interactive tool that helps a restaurant or
 * fleet manager estimate concretely how much they save by converting a
 * portion of aggregator orders to HIR direct.
 *
 * Lane MARKETING-ROI (2026-05-06). Static rendering, no server queries.
 * Defaults aligned with the static copy previously on /pricing
 * ("30 comenzi / zi de 80 RON medie pe Glovo").
 *
 * IMPORTANT: per CEO instruction, this widget intentionally does NOT
 * quote exact HIR fees. Output is framed as "potential savings" from
 * converting aggregator volume to direct (HIR) channel + manual hours
 * saved + indicative AI growth uplift. Pricing decisions stay on the
 * pricing cards above the calculator.
 */

import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Calculator, Clock, TrendingUp } from 'lucide-react';
import { useId, useMemo, useState } from 'react';

const DAYS_PER_MONTH = 30;
const AGGREGATOR_FEE = 0.30; // hardcoded ~30% — Glovo/Wolt/Bolt benchmark RO 2026
const DIRECT_CONVERSION_RATE = 0.3; // industry benchmark — 30 % of aggregator volume convertible to direct
const MANUAL_HOURS_PER_WEEK_BASE = 6; // base savings — manual order ops, menu sync, reconciliation

const formatRon = (value: number): string => {
  // RO style: thousands separator = ".", decimal separator = ","
  // Intl with locale 'ro-RO' produces NBSP sometimes — normalise to ".".
  return new Intl.NumberFormat('ro-RO', {
    style: 'decimal',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })
    .format(Math.round(value))
    .replace(/ /g, '.');
};

const formatHours = (value: number): string => {
  return new Intl.NumberFormat('ro-RO', {
    style: 'decimal',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.round(value));
};

type SliderInputProps = {
  label: string;
  hint: string;
  min: number;
  max: number;
  step: number;
  value: number;
  unit: string;
  onChange: (next: number) => void;
};

function SliderInput({
  label,
  hint,
  min,
  max,
  step,
  value,
  unit,
  onChange,
}: SliderInputProps) {
  const id = useId();
  const handleNumber = (raw: string) => {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return;
    const clamped = Math.min(max, Math.max(min, parsed));
    onChange(clamped);
  };
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <label
          htmlFor={id}
          className="text-sm font-medium text-[#0F172A]"
          title={hint}
        >
          {label}
        </label>
        <div className="flex items-center gap-1.5 text-sm tabular-nums text-[#0F172A]">
          <input
            type="number"
            inputMode="numeric"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={(event) => handleNumber(event.target.value)}
            aria-label={`${label} (valoare numerică)`}
            className="w-20 rounded-md border border-[#E2E8F0] bg-white px-2 py-1 text-right text-sm font-medium text-[#0F172A] focus:border-[#4F46E5] focus:outline-none focus:ring-2 focus:ring-[#C7D2FE]"
          />
          <span className="text-xs font-medium text-[#94A3B8]">{unit}</span>
        </div>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        aria-label={hint}
        className="h-2 w-full cursor-pointer appearance-none rounded-full bg-[#E2E8F0] accent-[#4F46E5]"
      />
      <p className="text-xs leading-relaxed text-[#94A3B8]">{hint}</p>
    </div>
  );
}

type ResultCardProps = {
  icon: React.ReactNode;
  label: string;
  value: string;
  unit: string;
  accent?: boolean;
};

function ResultCard({ icon, label, value, unit, accent }: ResultCardProps) {
  return (
    <div
      className={`rounded-lg border p-5 ${
        accent
          ? 'border-[#C7D2FE] bg-[#EEF2FF] ring-1 ring-[#C7D2FE]'
          : 'border-[#E2E8F0] bg-white'
      }`}
    >
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-[#475569]">
        <span
          className={accent ? 'text-[#4F46E5]' : 'text-[#94A3B8]'}
          aria-hidden
        >
          {icon}
        </span>
        {label}
      </div>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div
          key={value}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          className={`mt-3 text-3xl font-semibold leading-none tracking-tight tabular-nums ${
            accent ? 'text-[#4F46E5]' : 'text-[#0F172A]'
          }`}
          style={{ fontFeatureSettings: '"tnum"' }}
        >
          {value}
        </motion.div>
      </AnimatePresence>
      <div className="mt-1 text-xs text-[#94A3B8]">{unit}</div>
    </div>
  );
}

export function RoiCalculator() {
  const [ordersPerDay, setOrdersPerDay] = useState(30);
  const [orderValue, setOrderValue] = useState(80);

  const results = useMemo(() => {
    const monthlyOrders = ordersPerDay * DAYS_PER_MONTH;
    const monthlyVolume = monthlyOrders * orderValue;
    // Assume all orders currently go through aggregators (conservative calculator)
    const aggregatorCost = monthlyVolume * AGGREGATOR_FEE;
    const convertedSavings = monthlyVolume * AGGREGATOR_FEE * DIRECT_CONVERSION_RATE;
    // Manual hours: ~24 h / month base, scaled gently by order volume above 30 / day.
    const volumeFactor = Math.max(1, ordersPerDay / 30);
    const manualHoursSaved =
      MANUAL_HOURS_PER_WEEK_BASE * 4 * Math.min(volumeFactor, 3);
    return {
      monthlyVolume,
      aggregatorCost,
      convertedSavings,
      manualHoursSaved,
    };
  }, [ordersPerDay, orderValue]);

  return (
    <section
      id="calculator"
      className="border-y border-[#E2E8F0] bg-white py-16"
      aria-labelledby="roi-calculator-heading"
    >
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="mb-10 max-w-2xl">
          <div className="mb-3 inline-flex items-center gap-1.5 rounded-md bg-[#EEF2FF] px-2.5 py-1 text-xs font-medium text-[#4F46E5] ring-1 ring-inset ring-[#C7D2FE]">
            <Calculator className="h-3.5 w-3.5" aria-hidden />
            Calculator interactiv
          </div>
          <h2
            id="roi-calculator-heading"
            className="text-2xl font-semibold tracking-tight md:text-3xl"
          >
            Calculați singur economia lunară
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-[#475569]">
            Mutați slidere-le pentru valorile reale ale restaurantului
            dumneavoastră. Vedeți instant cât plătiți acum în comisioane și
            cât puteți recupera convertind o parte din volum la canalul direct.
          </p>
        </div>

        <div className="grid gap-8 md:grid-cols-2">
          {/* Inputs */}
          <div className="space-y-6 rounded-lg border border-[#E2E8F0] bg-[#FAFAFA] p-6">
            <SliderInput
              label="Comenzi medii pe zi"
              hint="Câte comenzi gestionați în medie într-o zi obișnuită."
              min={5}
              max={200}
              step={1}
              unit="comenzi"
              value={ordersPerDay}
              onChange={setOrdersPerDay}
            />
            <SliderInput
              label="Valoare medie pe comandă"
              hint="Valoarea medie a unei comenzi, fără TVA, în RON."
              min={20}
              max={200}
              step={5}
              unit="RON"
              value={orderValue}
              onChange={setOrderValue}
            />
            <p className="text-xs leading-relaxed text-[#94A3B8]">
              Comision agregator: ~30% (medie Glovo/Wolt/Bolt România 2026).
            </p>
          </div>

          {/* Outputs */}
          <div className="space-y-4">
            <ResultCard
              icon={<TrendingUp className="h-4 w-4" aria-hidden />}
              label="Volum lunar"
              value={`${formatRon(results.monthlyVolume)} RON`}
              unit="rulaj total estimat"
            />
            <ResultCard
              icon={<TrendingUp className="h-4 w-4" aria-hidden />}
              label="Cost lunar agregator (~30%)"
              value={`${formatRon(results.aggregatorCost)} RON`}
              unit="comisioane reținute de Glovo/Wolt/Bolt acum"
            />
            <ResultCard
              icon={<TrendingUp className="h-4 w-4" aria-hidden />}
              label="Economie estimată"
              value={`${formatRon(results.convertedSavings)} RON / lună`}
              unit="dacă convertiți 30% din volum la canalul direct HIR"
              accent
            />
            <ResultCard
              icon={<Clock className="h-4 w-4" aria-hidden />}
              label="Ore manuale economisite"
              value={`${formatHours(results.manualHoursSaved)} ore / lună`}
              unit="gestiune comenzi + sync meniu + reconciliere"
            />
          </div>
        </div>

        <p className="mt-8 max-w-3xl text-xs leading-relaxed text-[#94A3B8]">
          * Estimări bazate pe benchmark-uri industrie (comision agregator ~30%,
          rata medie de conversie la direct ~30%, ore manuale ~24h/lună). Rezultatele
          variază în funcție de volumul și specificul restaurantului dumneavoastră.
          Cifrele nu reprezintă o garanție contractuală.
        </p>

        <div className="mt-10 flex flex-col items-start gap-4 rounded-lg border border-[#E2E8F0] bg-[#FAFAFA] p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-base font-semibold text-[#0F172A]">
              Cu HIR păstrați 100% din relația cu clientul direct.
            </p>
            <p className="mt-1 text-sm text-[#475569]">
              Datele clienților rămân la dumneavoastră, brandingul rămâne al
              dumneavoastră, comunicarea rămâne directă.
            </p>
          </div>
          <Link
            href="/contact"
            className="inline-flex flex-none items-center justify-center gap-1.5 rounded-md bg-[#4F46E5] px-5 py-3 text-sm font-medium text-white ring-1 ring-inset ring-[#4338CA] hover:bg-[#4338CA]"
          >
            Începeți gratuit — Demo 30 minute
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </div>
    </section>
  );
}
