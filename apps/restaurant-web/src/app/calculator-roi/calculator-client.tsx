'use client';

/**
 * Calculator ROI interactiv — /calculator-roi
 * Calcule 100% client-side, fără query-uri server.
 * Lead capture via POST /api/marketing/calculator-leads.
 */

import { useId, useMemo, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';

const DAYS = 30;
const GLOVO_FEE = 0.30; // 30% comision Glovo/Wolt Romania
const GLOVO_RIDER_COST_PER_ORDER = 8; // lei estimat cost rider extern
const HIR_RIDER_COST_PER_ORDER = 5; // lei estimat cost HIR Curier
const HEPI_MONTHLY_FIX = 49; // lei/lună Content OS Pro
const HEPI_VARIABLE_RATE = 0.03; // 3% din revenue extra Hepi
const HEPI_MIN_EXTRA_ORDERS = 15; // minim comenzi noi/lună aduse de Hepi

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return new Intl.NumberFormat('ro-RO', {
    style: 'decimal',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })
    .format(Math.round(n))
    .replace(/ /g, '.'); // unify NBSP thousands separator
}

// ─── Calculations ────────────────────────────────────────────────────────────

export type CalcResult = {
  comenziLuna: number;
  venitBrut: number;
  glovoComision: number;
  hirComision: number;
  economieComisioane: number;
  hepiRevenueExtra: number;
  hepiCost: number;
  hepiNetBenefit: number;
  hepiRoi: number;
  economieRider: number;
  totalLuna: number;
  totalAn: number;
};

export function calcRoi(
  comenziPeZi: number,
  aov: number,
  withCourier: boolean,
  withHepi: boolean,
): CalcResult {
  const comenziLuna = comenziPeZi * DAYS;
  const venitBrut = comenziLuna * aov;
  const glovoComision = venitBrut * GLOVO_FEE;
  const hirComision = 2 * comenziLuna; // 2 lei/comandă

  const economieComisioane = glovoComision - hirComision;

  const hepiRevenueExtra = HEPI_MIN_EXTRA_ORDERS * aov;
  const hepiCost = HEPI_MONTHLY_FIX + HEPI_VARIABLE_RATE * hepiRevenueExtra;
  const hepiNetBenefit = withHepi ? hepiRevenueExtra - hepiCost : 0;
  const hepiRoi = hepiCost > 0 ? hepiRevenueExtra / hepiCost : 0;

  const riderGlovo = GLOVO_RIDER_COST_PER_ORDER * comenziLuna;
  const riderHir = HIR_RIDER_COST_PER_ORDER * comenziLuna;
  const economieRider = withCourier ? riderGlovo - riderHir : 0;

  const totalLuna = economieComisioane + hepiNetBenefit + economieRider;
  const totalAn = totalLuna * 12;

  return {
    comenziLuna,
    venitBrut,
    glovoComision,
    hirComision,
    economieComisioane,
    hepiRevenueExtra,
    hepiCost,
    hepiNetBenefit,
    hepiRoi,
    economieRider,
    totalLuna,
    totalAn,
  };
}

// ─── Slider ──────────────────────────────────────────────────────────────────

function SliderInput({
  label,
  min,
  max,
  step,
  value,
  unit,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  unit: string;
  onChange: (v: number) => void;
}) {
  const id = useId();
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <label htmlFor={id} className="text-sm font-medium text-slate-800">
          {label}
        </label>
        <span
          className="min-w-[80px] text-right text-base font-semibold tabular-nums text-indigo-700"
          aria-live="polite"
          aria-atomic="true"
        >
          {fmt(value)} {unit}
        </span>
      </div>
      <div className="relative h-5 flex items-center">
        <div className="relative w-full h-2 rounded-full bg-slate-200">
          <div
            className="absolute left-0 top-0 h-2 rounded-full bg-indigo-500 pointer-events-none"
            style={{ width: `${pct}%` }}
            aria-hidden
          />
        </div>
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-label={label}
          className="absolute inset-0 w-full h-2 cursor-pointer appearance-none rounded-full bg-transparent accent-indigo-600"
        />
      </div>
      <div className="flex justify-between text-[10px] text-slate-400">
        <span>{fmt(min)}</span>
        <span>{fmt(max)}</span>
      </div>
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
      className="flex cursor-pointer items-center justify-between gap-4 rounded-lg border border-slate-200 bg-white px-4 py-3"
    >
      <span className="text-sm font-medium text-slate-800">{label}</span>
      <span
        role="switch"
        aria-checked={checked}
        className={`relative inline-flex h-6 w-11 flex-none items-center rounded-full transition-colors ${
          checked ? 'bg-indigo-600' : 'bg-slate-200'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </span>
      <input
        id={id}
        type="checkbox"
        className="sr-only"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        aria-label={label}
      />
    </label>
  );
}

// ─── Result card ─────────────────────────────────────────────────────────────

function ResultCard({
  label,
  children,
  variant = 'default',
  hidden = false,
}: {
  label: string;
  children: React.ReactNode;
  variant?: 'default' | 'green' | 'total';
  hidden?: boolean;
}) {
  if (hidden) return null;
  const border =
    variant === 'total'
      ? 'border-indigo-300 bg-indigo-50 ring-1 ring-indigo-200'
      : variant === 'green'
        ? 'border-emerald-200 bg-emerald-50'
        : 'border-slate-200 bg-white';
  return (
    <div className={`rounded-lg border p-5 ${border}`}>
      <p
        className={`text-xs font-semibold uppercase tracking-wider ${
          variant === 'total' ? 'text-indigo-600' : 'text-slate-500'
        }`}
      >
        {label}
      </p>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function Money({ value, suffix }: { value: number; suffix?: string }) {
  return (
    <span
      className="tabular-nums text-2xl font-bold leading-none text-slate-900"
      aria-live="polite"
      aria-atomic="true"
    >
      {fmt(value)} lei{suffix ? ` ${suffix}` : ''}
    </span>
  );
}

// ─── Lead form ────────────────────────────────────────────────────────────────

type FormState = 'idle' | 'loading' | 'success' | 'error' | 'phone_error';

function LeadForm({ result }: { result: CalcResult }) {
  const [phone, setPhone] = useState('');
  const [restaurantName, setRestaurantName] = useState('');
  const [city, setCity] = useState('');
  const [formState, setFormState] = useState<FormState>('idle');

  const phoneId = useId();
  const nameId = useId();
  const cityId = useId();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // Basic client-side phone check before the round-trip
    const stripped = phone.trim().replace(/\s+/g, '');
    if (!/^(\+40|0)(7\d{8}|[2-9]\d{7,8})$/.test(stripped)) {
      setFormState('phone_error');
      return;
    }

    setFormState('loading');
    try {
      const res = await fetch('/api/marketing/calculator-leads', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          phone: stripped,
          restaurantName: restaurantName.trim() || undefined,
          city: city.trim() || undefined,
          comenziPerZi: result.comenziLuna / DAYS,
          aovLei: Math.round(result.venitBrut / result.comenziLuna),
          estimatedSavingsMonthlyLei: Math.round(result.totalLuna),
        }),
      });
      if (res.ok) {
        setFormState('success');
      } else {
        const body = await res.json().catch(() => ({}));
        if (
          res.status === 400 &&
          (body as { issues?: { phone?: string[] } }).issues?.phone
        ) {
          setFormState('phone_error');
        } else {
          setFormState('error');
        }
      }
    } catch {
      setFormState('error');
    }
  }

  if (formState === 'success') {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-6 py-8 text-center">
        <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" aria-hidden />
        <p className="mt-3 text-lg font-semibold text-emerald-800">
          Super! Te sunăm în curând.
        </p>
        <p className="mt-1 text-sm text-emerald-700">
          Iulian va lua legătura cu tine în cel mai scurt timp pentru un onboarding de 30 de minute.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <div>
        <label htmlFor={phoneId} className="block text-sm font-medium text-slate-800">
          Telefon <span aria-hidden className="text-red-500">*</span>
        </label>
        <input
          id={phoneId}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          required
          placeholder="0712 345 678"
          value={phone}
          onChange={(e) => {
            setPhone(e.target.value);
            if (formState === 'phone_error') setFormState('idle');
          }}
          aria-describedby={formState === 'phone_error' ? `${phoneId}-err` : undefined}
          aria-invalid={formState === 'phone_error' ? 'true' : undefined}
          className={`mt-1 block w-full rounded-lg border px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 outline-none transition focus:ring-2 focus:ring-indigo-500 ${
            formState === 'phone_error'
              ? 'border-red-400 bg-red-50 focus:ring-red-400'
              : 'border-slate-300 bg-white focus:border-indigo-400'
          }`}
        />
        {formState === 'phone_error' && (
          <p id={`${phoneId}-err`} className="mt-1 text-xs text-red-600" role="alert">
            Număr invalid. Exemplu: 0712345678 sau +40712345678
          </p>
        )}
      </div>

      <div>
        <label htmlFor={nameId} className="block text-sm font-medium text-slate-800">
          Nume restaurant{' '}
          <span className="text-xs font-normal text-slate-400">(opțional)</span>
        </label>
        <input
          id={nameId}
          type="text"
          autoComplete="organization"
          placeholder="Ex: Pizzeria Bella"
          value={restaurantName}
          onChange={(e) => setRestaurantName(e.target.value)}
          className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      <div>
        <label htmlFor={cityId} className="block text-sm font-medium text-slate-800">
          Oraș{' '}
          <span className="text-xs font-normal text-slate-400">(opțional)</span>
        </label>
        <input
          id={cityId}
          type="text"
          autoComplete="address-level2"
          placeholder="Ex: Brașov"
          value={city}
          onChange={(e) => setCity(e.target.value)}
          className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      {formState === 'error' && (
        <p className="text-sm text-red-600" role="alert">
          A apărut o eroare. Încearcă din nou sau scrie-ne la office@hirforyou.ro.
        </p>
      )}

      <button
        type="submit"
        disabled={formState === 'loading'}
        className="w-full rounded-lg bg-indigo-600 px-5 py-3.5 text-sm font-semibold text-white shadow-md shadow-indigo-200 ring-1 ring-inset ring-indigo-500 transition-all hover:bg-indigo-700 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-indigo-600 focus-visible:outline-offset-2 active:translate-y-px"
      >
        {formState === 'loading'
          ? 'Se trimite…'
          : 'Vreau să fiu sunat de Iulian — onboarding 30 min'}
      </button>

      <p className="text-center text-xs text-slate-400">
        Fără spam. Apel de 30 de minute, personal, fără obligații.
      </p>
    </form>
  );
}

// ─── Benefits list ────────────────────────────────────────────────────────────

const BENEFITS = [
  'Site propriu (NU pe Glovo / Wolt)',
  'Baza de date clienți rămâne la TINE',
  'Curier 24/7 integrat (sub controlul tău)',
  'AI marketing inclus (Hepi pe Telegram/WhatsApp)',
  '90 zile GRATIS, fără card',
  'Migrare 24h gratuit din GloriaFood sau altă platformă',
];

// ─── Main component ──────────────────────────────────────────────────────────

export default function CalculatorClient() {
  const [comenziPeZi, setComenziPeZi] = useState(100);
  const [aov, setAov] = useState(80);
  const [withCourier, setWithCourier] = useState(true);
  const [withHepi, setWithHepi] = useState(true);

  const result = useMemo(
    () => calcRoi(comenziPeZi, aov, withCourier, withHepi),
    [comenziPeZi, aov, withCourier, withHepi],
  );

  return (
    <div className="space-y-12">
      {/* ── Inputs ── */}
      <section
        aria-labelledby="inputs-heading"
        className="rounded-2xl border border-slate-200 bg-slate-50 p-6 sm:p-8"
      >
        <h2
          id="inputs-heading"
          className="mb-6 text-lg font-semibold text-slate-900"
        >
          Configurează restaurantul tău
        </h2>
        <div className="grid gap-6 sm:grid-cols-2">
          <SliderInput
            label="Comenzi pe zi"
            min={10}
            max={500}
            step={5}
            value={comenziPeZi}
            unit="comenzi"
            onChange={setComenziPeZi}
          />
          <SliderInput
            label="Valoare medie comandă"
            min={30}
            max={200}
            step={5}
            value={aov}
            unit="lei"
            onChange={setAov}
          />
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <Toggle
            label="Curier integrat HIR?"
            checked={withCourier}
            onChange={setWithCourier}
          />
          <Toggle
            label="AI marketing Hepi (Content OS Pro)?"
            checked={withHepi}
            onChange={setWithHepi}
          />
        </div>
      </section>

      {/* ── Results ── */}
      <section aria-labelledby="results-heading">
        <h2 id="results-heading" className="sr-only">
          Rezultate calculate
        </h2>

        {/* Card 1 — Commission savings (always shown) */}
        <ResultCard label="Economie comisioane / lună" variant="green">
          <dl className="space-y-2 text-sm text-slate-600">
            <div className="flex justify-between">
              <dt>Comenzi / lună</dt>
              <dd className="font-semibold tabular-nums text-slate-900">
                {fmt(result.comenziLuna)} comenzi
              </dd>
            </div>
            <div className="flex justify-between">
              <dt>Venit brut</dt>
              <dd className="font-semibold tabular-nums text-slate-900">
                {fmt(result.venitBrut)} lei
              </dd>
            </div>
            <div className="flex justify-between border-t border-slate-200 pt-2">
              <dt className="text-red-600">Glovo ia (30%)</dt>
              <dd className="font-semibold tabular-nums text-red-600">
                − {fmt(result.glovoComision)} lei
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-indigo-700">HIR ia (2 lei × comenzi)</dt>
              <dd className="font-semibold tabular-nums text-indigo-700">
                − {fmt(result.hirComision)} lei
              </dd>
            </div>
            <div className="flex justify-between border-t border-emerald-300 pt-2 text-base">
              <dt className="font-bold text-emerald-800">Economie comisioane</dt>
              <dd>
                <Money value={result.economieComisioane} suffix="/lună" />
              </dd>
            </div>
          </dl>
        </ResultCard>

        {/* Card 2 — Hepi AI marketing (conditional) */}
        <ResultCard
          label="Bonus AI Marketing Hepi"
          variant="default"
          hidden={!withHepi}
        >
          <dl className="space-y-2 text-sm text-slate-600">
            <div className="flex justify-between">
              <dt>Comenzi noi / lună (minim)</dt>
              <dd className="font-semibold tabular-nums text-slate-900">
                {HEPI_MIN_EXTRA_ORDERS} comenzi
              </dd>
            </div>
            <div className="flex justify-between">
              <dt>Revenue extra</dt>
              <dd className="font-semibold tabular-nums text-slate-900">
                {fmt(result.hepiRevenueExtra)} lei
              </dd>
            </div>
            <div className="flex justify-between">
              <dt>Cost HIR Content OS Pro</dt>
              <dd className="font-semibold tabular-nums text-red-600">
                − {fmt(result.hepiCost)} lei
              </dd>
            </div>
            <div className="flex justify-between border-t border-slate-200 pt-2 text-base">
              <dt className="font-bold text-slate-900">Net benefit</dt>
              <dd>
                <Money value={result.hepiNetBenefit} suffix="/lună" />
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">ROI Hepi</dt>
              <dd className="font-semibold text-emerald-700">
                {Math.round(result.hepiRoi)}×
              </dd>
            </div>
          </dl>
        </ResultCard>

        {/* Card 3 — Courier savings (conditional) */}
        <ResultCard
          label="Economie curier integrat / lună"
          variant="default"
          hidden={!withCourier}
        >
          <dl className="space-y-2 text-sm text-slate-600">
            <div className="flex justify-between">
              <dt className="text-red-600">
                Cost rider extern Glovo (~{GLOVO_RIDER_COST_PER_ORDER} lei/cmd)
              </dt>
              <dd className="font-semibold tabular-nums text-red-600">
                {fmt(GLOVO_RIDER_COST_PER_ORDER * result.comenziLuna)} lei
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-indigo-700">
                Cost HIR Curier propriu (~{HIR_RIDER_COST_PER_ORDER} lei/cmd)
              </dt>
              <dd className="font-semibold tabular-nums text-indigo-700">
                {fmt(HIR_RIDER_COST_PER_ORDER * result.comenziLuna)} lei
              </dd>
            </div>
            <div className="flex justify-between border-t border-slate-200 pt-2 text-base">
              <dt className="font-bold text-slate-900">Economie curier</dt>
              <dd>
                <Money value={result.economieRider} suffix="/lună" />
              </dd>
            </div>
          </dl>
        </ResultCard>

        {/* Card 4 — Total summary */}
        <ResultCard label="TOTAL economie estimată" variant="total">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs text-indigo-600 uppercase tracking-wide font-semibold">Lunar</p>
              <p
                className="mt-0.5 text-4xl font-extrabold tabular-nums text-indigo-800"
                aria-live="polite"
                aria-atomic="true"
              >
                ~{fmt(result.totalLuna)} lei
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-indigo-600 uppercase tracking-wide font-semibold">Anual</p>
              <p
                className="mt-0.5 text-2xl font-bold tabular-nums text-indigo-700"
                aria-live="polite"
                aria-atomic="true"
              >
                ~{fmt(result.totalAn)} lei
              </p>
            </div>
          </div>
          <p className="mt-3 text-xs text-slate-400">
            * Estimare orientativă. Economie reală variază în funcție de contract și
            specificul restaurantului. HIR ia 2 lei/comandă procesată — fără alt comision.
          </p>
        </ResultCard>
      </section>

      {/* ── Benefits list ── */}
      <section aria-labelledby="benefits-heading">
        <h2
          id="benefits-heading"
          className="mb-5 text-xl font-semibold text-slate-900"
        >
          Ce primești cu HIR
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2" role="list">
          {BENEFITS.map((b) => (
            <li key={b} className="flex items-start gap-3">
              <CheckCircle2
                className="mt-0.5 h-5 w-5 flex-none text-emerald-600"
                aria-hidden
              />
              <span className="text-sm text-slate-700">{b}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* ── Lead capture ── */}
      <section
        aria-labelledby="cta-heading"
        className="rounded-2xl border border-indigo-200 bg-indigo-50 p-6 sm:p-8"
      >
        <h2
          id="cta-heading"
          className="mb-2 text-xl font-semibold text-indigo-900"
        >
          Economisești ~{fmt(result.totalLuna)} lei/lună?
        </h2>
        <p className="mb-6 text-sm text-indigo-700">
          Lasă-ne numărul de telefon. Iulian te sună personal în 30 de minute și
          configurăm totul împreună — gratuit, fără obligații.
        </p>
        <LeadForm result={result} />
      </section>
    </div>
  );
}
