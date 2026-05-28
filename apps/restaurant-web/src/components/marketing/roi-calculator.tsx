'use client';

/**
 * ROI Calculator widget — interactive tool that helps a restaurant owner
 * estimate concretely how much they save by switching from Glovo/Wolt/Bolt
 * to HIR direct, with optional HIR Curier and Content OS Pro (Hepi).
 *
 * Lane MARKETING-ROI (2026-05-06 → enhanced 2026-05-28).
 * Static rendering, no server queries — all math is client-side.
 *
 * Pricing transparency updated per CEO decision 2026-05-28:
 *   - Quotes 2 lei/comandă explicitly (Standard HIR price)
 *   - Quotes Glovo 30% commission explicitly
 *   - Toggles for HIR Curier + Content OS Pro (Hepi)
 *   - Lead capture form → POST /api/marketing/calculator-leads
 */

import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowRight,
  Calculator,
  TrendingUp,
  Truck,
  Sparkles,
  Euro,
} from 'lucide-react';
import { useId, useMemo, useState } from 'react';

// ─── Constants ───────────────────────────────────────────────────────────────

const DAYS_PER_MONTH = 30;
const GLOVO_FEE = 0.3; // 30% comision Glovo/Wolt/Bolt Romania
const HIR_COST_PER_ORDER = 2; // 2 lei/comandă Standard HIR
const GLOVO_RIDER_PER_ORDER = 8; // ~8 lei cost rider extern Glovo
const HIR_RIDER_PER_ORDER = 5; // ~5 lei cost HIR Curier
const HEPI_MONTHLY_FIX = 49; // lei/lună Content OS Pro
const HEPI_VARIABLE_RATE = 0.03; // 3% din veniturile extra Hepi
const HEPI_EXTRA_ORDERS = 15; // comenzi noi/lună aduse de Hepi (minim estimat)

// ─── Pure calculation (exported so tests can import without DOM) ──────────────

export type CalcResult = {
  comenziLuna: number;
  venitBrut: number;
  glovoComision: number;
  hirComision: number;
  economieComisioane: number;
  economieRider: number;
  hepiRevenueExtra: number;
  hepiCost: number;
  hepiNetBenefit: number;
  totalLuna: number;
  totalAn: number;
};

export function calcRoi(
  comenziPeZi: number,
  aov: number,
  withCourier: boolean,
  withHepi: boolean,
): CalcResult {
  const comenziLuna = comenziPeZi * DAYS_PER_MONTH;
  const venitBrut = comenziLuna * aov;

  const glovoComision = venitBrut * GLOVO_FEE;
  const hirComision = HIR_COST_PER_ORDER * comenziLuna;
  const economieComisioane = glovoComision - hirComision;

  const riderGlovo = GLOVO_RIDER_PER_ORDER * comenziLuna;
  const riderHir = HIR_RIDER_PER_ORDER * comenziLuna;
  const economieRider = withCourier ? riderGlovo - riderHir : 0;

  const hepiRevenueExtra = HEPI_EXTRA_ORDERS * aov;
  const hepiCost = HEPI_MONTHLY_FIX + HEPI_VARIABLE_RATE * hepiRevenueExtra;
  const hepiNetBenefit = withHepi ? hepiRevenueExtra - hepiCost : 0;

  const totalLuna = economieComisioane + economieRider + hepiNetBenefit;
  const totalAn = totalLuna * 12;

  return {
    comenziLuna,
    venitBrut,
    glovoComision,
    hirComision,
    economieComisioane,
    economieRider,
    hepiRevenueExtra,
    hepiCost,
    hepiNetBenefit,
    totalLuna,
    totalAn,
  };
}

// ─── Formatters ──────────────────────────────────────────────────────────────

const formatRon = (value: number): string =>
  new Intl.NumberFormat('ro-RO', {
    style: 'decimal',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })
    .format(Math.round(value))
    .replace(/ /g, '.');

// ─── SliderInput ─────────────────────────────────────────────────────────────

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
    onChange(Math.min(max, Math.max(min, parsed)));
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
            onChange={(e) => handleNumber(e.target.value)}
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
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={hint}
        className="h-2 w-full cursor-pointer appearance-none rounded-full bg-[#E2E8F0] accent-[#4F46E5]"
      />
      <p className="text-xs leading-relaxed text-[#94A3B8]">{hint}</p>
    </div>
  );
}

// ─── Toggle ──────────────────────────────────────────────────────────────────

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  const id = useId();
  return (
    <label
      htmlFor={id}
      className="flex cursor-pointer items-center gap-3 rounded-lg border border-[#E2E8F0] bg-white px-4 py-3"
    >
      <input
        id={id}
        type="checkbox"
        className="sr-only"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span
        role="switch"
        aria-checked={checked}
        aria-label={label}
        className={`relative inline-flex h-6 w-11 flex-none items-center rounded-full transition-colors ${
          checked ? 'bg-[#4F46E5]' : 'bg-[#CBD5E1]'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-6' : 'translate-x-1'
          }`}
          aria-hidden
        />
      </span>
      <span className="text-sm font-medium text-[#0F172A]">{label}</span>
    </label>
  );
}

// ─── ResultCard ───────────────────────────────────────────────────────────────

type ResultCardProps = {
  icon: React.ReactNode;
  label: string;
  value: string;
  unit: string;
  accent?: 'normal' | 'supreme';
};

function ResultCard({ icon, label, value, unit, accent }: ResultCardProps) {
  const isSupreme = accent === 'supreme';
  const isNormal = accent === 'normal';
  return (
    <div
      className={`rounded-lg border p-5 ${
        isSupreme
          ? 'border-[#4F46E5] bg-[#EEF2FF] ring-2 ring-[#4F46E5]'
          : isNormal
            ? 'border-[#C7D2FE] bg-[#EEF2FF] ring-1 ring-[#C7D2FE]'
            : 'border-[#E2E8F0] bg-white'
      }`}
    >
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-[#475569]">
        <span
          className={isSupreme || isNormal ? 'text-[#4F46E5]' : 'text-[#94A3B8]'}
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
          className={`mt-3 leading-none tracking-tight tabular-nums ${
            isSupreme
              ? 'text-4xl font-bold text-[#4F46E5]'
              : isNormal
                ? 'text-3xl font-semibold text-[#4F46E5]'
                : 'text-3xl font-semibold text-[#0F172A]'
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

// ─── Lead form state ──────────────────────────────────────────────────────────

type LeadStatus = 'idle' | 'submitting' | 'success' | 'error';

// ─── Main component ───────────────────────────────────────────────────────────

export function RoiCalculator() {
  const [ordersPerDay, setOrdersPerDay] = useState(30);
  const [orderValue, setOrderValue] = useState(80);
  const [withHirCurier, setWithHirCurier] = useState(true);
  const [withContentOsPro, setWithContentOsPro] = useState(true);

  // Lead form
  const [phone, setPhone] = useState('');
  const [restaurantName, setRestaurantName] = useState('');
  const [city, setCity] = useState('');
  const [leadStatus, setLeadStatus] = useState<LeadStatus>('idle');
  const [leadError, setLeadError] = useState('');

  const r = useMemo(
    () => calcRoi(ordersPerDay, orderValue, withHirCurier, withContentOsPro),
    [ordersPerDay, orderValue, withHirCurier, withContentOsPro],
  );

  async function handleLeadSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLeadStatus('submitting');
    setLeadError('');
    try {
      const res = await fetch('/api/marketing/calculator-leads', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          phone: phone.trim(),
          restaurantName: restaurantName.trim() || undefined,
          city: city.trim() || undefined,
          comenziPerZi: ordersPerDay,
          aovLei: orderValue,
          estimatedSavingsMonthlyLei: Math.round(r.totalLuna),
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        if (body.error === 'invalid_body') {
          setLeadError('Verificați numărul de telefon (format RO: 07xx xxx xxx).');
        } else if (body.error === 'rate_limited') {
          setLeadError('Prea multe cereri. Încercați din nou peste o oră.');
        } else {
          setLeadError('A apărut o eroare. Încercați din nou sau scrieți pe WhatsApp.');
        }
        setLeadStatus('error');
        return;
      }
      setLeadStatus('success');
    } catch {
      setLeadError('Eroare de rețea. Verificați conexiunea și încercați din nou.');
      setLeadStatus('error');
    }
  }

  return (
    <section
      id="calculator"
      className="border-y border-[#E2E8F0] bg-white py-16"
      aria-labelledby="roi-calculator-heading"
    >
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        {/* Header */}
        <div className="mb-10 max-w-2xl">
          <div className="mb-3 inline-flex items-center gap-1.5 rounded-md bg-[#EEF2FF] px-2.5 py-1 text-xs font-medium text-[#4F46E5] ring-1 ring-inset ring-[#C7D2FE]">
            <Calculator className="h-3.5 w-3.5" aria-hidden />
            Calculator interactiv
          </div>
          <h2
            id="roi-calculator-heading"
            className="text-2xl font-semibold tracking-tight md:text-3xl"
          >
            Calculați singur câți bani rămân la dumneavoastră
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-[#475569]">
            Mutați slidere-le și activați opțiunile de care aveți nevoie.
            Vedeți instant economia versus Glovo / Wolt / Bolt + ce câștigați
            cu HIR Curier și AI marketing.
          </p>
        </div>

        {/* Inputs */}
        <div className="grid gap-8 md:grid-cols-2">
          <div className="space-y-6 rounded-lg border border-[#E2E8F0] bg-[#FAFAFA] p-6">
            <SliderInput
              label="Comenzi medii pe zi"
              hint="Câte comenzi gestionați în medie într-o zi obișnuită."
              min={5}
              max={500}
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
              Comision Glovo/Wolt/Bolt România: 30% din valoarea comenzii.
              HIR Standard: 2 lei / comandă — fix, indiferent de valoare.
            </p>
          </div>

          {/* Outputs */}
          <div className="space-y-4">
            {/* Toggles */}
            <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
              <div className="flex-1">
                <Toggle
                  label="Curier HIR (5 lei vs 8 lei Glovo Rider)"
                  checked={withHirCurier}
                  onChange={setWithHirCurier}
                />
              </div>
              <div className="flex-1">
                <Toggle
                  label="AI marketing Hepi (+15 comenzi/lună)"
                  checked={withContentOsPro}
                  onChange={setWithContentOsPro}
                />
              </div>
            </div>

            {/* Card 1 — Volum lunar */}
            <ResultCard
              icon={<TrendingUp className="h-4 w-4" aria-hidden />}
              label="Volum lunar"
              value={`${formatRon(r.venitBrut)} RON`}
              unit="rulaj total estimat"
            />

            {/* Card 2 — Cost agregator */}
            <ResultCard
              icon={<TrendingUp className="h-4 w-4" aria-hidden />}
              label="Cost lunar agregator (Glovo)"
              value={`${formatRon(r.glovoComision)} RON`}
              unit={`30% × ${formatRon(r.venitBrut)} RON — bani pierduți la Glovo`}
            />

            {/* Card 3 — Cost HIR */}
            <ResultCard
              icon={<Euro className="h-4 w-4" aria-hidden />}
              label="Cost HIR Standard"
              value={`${formatRon(r.hirComision)} RON`}
              unit={`2 lei × ${formatRon(r.comenziLuna)} comenzi / lună`}
            />

            {/* Card 4 — Economie comisioane (accent normal) */}
            <ResultCard
              icon={<TrendingUp className="h-4 w-4" aria-hidden />}
              label="Economie comisioane"
              value={`${formatRon(r.economieComisioane)} RON / lună`}
              unit="bani care rămân la dumneavoastră vs Glovo"
              accent="normal"
            />

            {/* Card 5 — Economie curier (conditional) */}
            <AnimatePresence initial={false}>
              {withHirCurier && (
                <motion.div
                  key="courier-card"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <ResultCard
                    icon={<Truck className="h-4 w-4" aria-hidden />}
                    label="Economie curier"
                    value={`${formatRon(r.economieRider)} RON / lună`}
                    unit="HIR Curier 5 lei vs Glovo Rider ~8 lei per livrare"
                  />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Card 6 — Bonus AI marketing (conditional) */}
            <AnimatePresence initial={false}>
              {withContentOsPro && (
                <motion.div
                  key="hepi-card"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <ResultCard
                    icon={<Sparkles className="h-4 w-4" aria-hidden />}
                    label="Bonus AI marketing Hepi"
                    value={`+${formatRon(r.hepiNetBenefit)} RON / lună`}
                    unit={`~15 comenzi noi din social media − 49 lei/lună Hepi`}
                  />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Card 7 — Total anual (supreme) */}
            <ResultCard
              icon={<TrendingUp className="h-4 w-4" aria-hidden />}
              label="Total anual estimat"
              value={`${formatRon(r.totalAn)} RON / an`}
              unit={`${formatRon(r.totalLuna)} RON / lună × 12`}
              accent="supreme"
            />
          </div>
        </div>

        {/* Lead capture */}
        <section
          className="mt-10 rounded-lg border border-[#C7D2FE] bg-[#EEF2FF] p-6"
          aria-label="Formular contact — demo gratuit"
        >
          {leadStatus === 'success' ? (
            <div className="text-center py-4">
              <p className="text-base font-semibold text-[#4F46E5]">
                Mulțumesc! Vă sun în maxim 24h.
              </p>
              <p className="mt-1 text-sm text-[#475569]">
                — Iulian, fondator HIR
              </p>
            </div>
          ) : (
            <>
              <h3 className="text-lg font-semibold text-[#0F172A]">
                Vreți să economisiți{' '}
                <span className="text-[#4F46E5]">
                  {formatRon(r.totalAn)} RON / an
                </span>
                ? Hai să stăm 30 de minute.
              </h3>
              <p className="mt-1 text-sm text-[#475569]">
                Vă sun eu, Iulian, fondator HIR. Vă configurez restaurantul
                personal, 90 zile gratis fără card.
              </p>
              <form
                onSubmit={handleLeadSubmit}
                className="mt-4 grid gap-3 sm:grid-cols-3"
              >
                <div className="sm:col-span-1">
                  <label htmlFor="lead-phone" className="sr-only">
                    Telefon
                  </label>
                  <input
                    id="lead-phone"
                    name="phone"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder="Telefon RO 07xx xxx xxx"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full rounded-md border border-[#C7D2FE] bg-white px-3 py-2.5 text-sm text-[#0F172A] placeholder-[#94A3B8] focus:border-[#4F46E5] focus:outline-none focus:ring-2 focus:ring-[#C7D2FE]"
                  />
                </div>
                <div className="sm:col-span-1">
                  <label htmlFor="lead-restaurant" className="sr-only">
                    Nume restaurant (opțional)
                  </label>
                  <input
                    id="lead-restaurant"
                    name="restaurantName"
                    type="text"
                    autoComplete="organization"
                    placeholder="Nume restaurant (opțional)"
                    value={restaurantName}
                    onChange={(e) => setRestaurantName(e.target.value)}
                    className="w-full rounded-md border border-[#C7D2FE] bg-white px-3 py-2.5 text-sm text-[#0F172A] placeholder-[#94A3B8] focus:border-[#4F46E5] focus:outline-none focus:ring-2 focus:ring-[#C7D2FE]"
                  />
                </div>
                <div className="sm:col-span-1">
                  <label htmlFor="lead-city" className="sr-only">
                    Oraș (opțional)
                  </label>
                  <input
                    id="lead-city"
                    name="city"
                    type="text"
                    autoComplete="address-level2"
                    placeholder="Oraș (opțional)"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="w-full rounded-md border border-[#C7D2FE] bg-white px-3 py-2.5 text-sm text-[#0F172A] placeholder-[#94A3B8] focus:border-[#4F46E5] focus:outline-none focus:ring-2 focus:ring-[#C7D2FE]"
                  />
                </div>
                <button
                  type="submit"
                  disabled={leadStatus === 'submitting'}
                  aria-label="Trimiteți cererea de demo — vă sunam în 24h"
                  className="sm:col-span-3 inline-flex items-center justify-center gap-2 rounded-md bg-[#4F46E5] px-5 py-3 text-sm font-medium text-white ring-1 ring-inset ring-[#4338CA] transition-colors hover:bg-[#4338CA] disabled:opacity-60"
                >
                  {leadStatus === 'submitting' ? (
                    'Se trimite...'
                  ) : (
                    <>
                      Vreau să fiu sunat
                      <ArrowRight className="h-4 w-4" aria-hidden />
                    </>
                  )}
                </button>
              </form>
              {leadStatus === 'error' && leadError && (
                <p
                  role="alert"
                  className="mt-2 text-sm font-medium text-red-600"
                >
                  {leadError}
                </p>
              )}
              <p className="mt-2 text-xs text-[#94A3B8]">
                Vă sun în maxim 24h. Nu vă înscrieți la nimic — doar o
                discuție.
              </p>
            </>
          )}
        </section>

        {/* Disclaimer */}
        <p className="mt-8 max-w-3xl text-xs leading-relaxed text-[#94A3B8]">
          * Estimări bazate pe benchmark-uri industrie (comision Glovo/Wolt/Bolt
          tipic 30%; HIR Standard 2 lei/comandă fix; cost curier extern ~8 lei
          vs HIR Curier ~5 lei; Hepi minimum 15 comenzi noi/lună din social
          media). Rezultatele variază în funcție de volumul și specificul
          restaurantului dumneavoastră. Cifrele nu reprezintă o garanție
          contractuală.
        </p>

        {/* Footer CTA */}
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
