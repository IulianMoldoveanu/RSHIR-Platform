'use client';

// Lane ONBOARD — wizard client. 6 steps, mobile-first, autosave.
//
// Layout:
//   ┌─ sticky progress bar (step labels + ETA) ─┐
//   │                                            │
//   │  active step panel (controlled by state)   │
//   │                                            │
//   ├─ back / save-draft / next ─────────────────┤
//   └────────────────────────────────────────────┘
//
// Steps that delegate to existing pages (branding upload, zones map,
// master-key import) render a "Open in new tab" link plus a "Mark done"
// or "I'll do this later" toggle, then the next render reads the
// underlying source-of-truth (`sourceState`) on the server.

import { useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  saveWizardDraft,
  saveRestaurantInfo,
  saveCodEnabled,
  wizardGoLive,
  type WizardDraft,
} from './actions';
import { uploadBrandingAsset, setBrandColor } from '../../settings/branding/actions';
import { tenantStorefrontUrl } from '@/lib/storefront-url';

type SourceState = {
  menu_added: boolean;
  hours_set: boolean;
  zones_set: boolean;
};

type Persisted = {
  contact_phone: string;
  address: string;
  city: string;
  city_id: string | null;
  location_lat: number | null;
  location_lng: number | null;
  logo_url: string | null;
  brand_color: string | null;
  cod_enabled: boolean;
};

// Lane MULTI-CITY: canonical cities list passed from the server.
type CityOption = {
  id: string;
  name: string;
  slug: string;
  county: string | null;
};

type StepDef = {
  num: number;
  label: string;
  shortLabel: string; // for sticky bar on small screens
  estMinutes: number;
};

const STEPS: StepDef[] = [
  { num: 1, label: 'Detalii restaurant', shortLabel: 'Detalii', estMinutes: 1 },
  { num: 2, label: 'Identitate vizuală', shortLabel: 'Brand', estMinutes: 2 },
  { num: 3, label: 'Meniu', shortLabel: 'Meniu', estMinutes: 3 },
  { num: 4, label: 'Livrare', shortLabel: 'Livrare', estMinutes: 2 },
  { num: 5, label: 'Plăți', shortLabel: 'Plăți', estMinutes: 1 },
  { num: 6, label: 'Activează comenzi', shortLabel: 'Go-live', estMinutes: 1 },
];
const TOTAL_EST = STEPS.reduce((s, x) => s + x.estMinutes, 0);

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

const PRESET_COLORS = ['#0F172A', '#4F46E5', '#10B981', '#F59E0B', '#EF4444', '#A855F7'];

export function WizardClient(props: {
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  canEdit: boolean;
  initialDraft: WizardDraft;
  initialStep: number;
  sourceState: SourceState;
  persisted: Persisted;
  cities: CityOption[];
}) {
  const router = useRouter();
  const [step, setStep] = useState<number>(Math.min(Math.max(props.initialStep, 1), 6));
  const [draft, setDraft] = useState<WizardDraft>(() => ({
    ...props.initialDraft,
    restaurantInfo: {
      // Prefer persisted values when the draft is empty (first visit)
      phone:
        props.initialDraft.restaurantInfo.phone || props.persisted.contact_phone || '',
      address: props.initialDraft.restaurantInfo.address || props.persisted.address || '',
      city: props.initialDraft.restaurantInfo.city || props.persisted.city || '',
      city_id:
        props.initialDraft.restaurantInfo.city_id ?? props.persisted.city_id ?? null,
      location_lat:
        props.initialDraft.restaurantInfo.location_lat ?? props.persisted.location_lat,
      location_lng:
        props.initialDraft.restaurantInfo.location_lng ?? props.persisted.location_lng,
    },
    payment: {
      cod_enabled: props.persisted.cod_enabled,
    },
  }));
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Autosave the draft 1.2s after the last edit.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void (async () => {
        const r = await saveWizardDraft({
          tenantId: props.tenantId,
          data: draft,
          step,
        });
        if (r.ok) setSavedAt(new Date());
      })();
    }, 1200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [draft, step, props.tenantId]);

  function patchDraft(patch: Partial<WizardDraft>) {
    setDraft((d) => ({ ...d, ...patch }));
  }

  async function saveNow() {
    const r = await saveWizardDraft({ tenantId: props.tenantId, data: draft, step });
    if (r.ok) setSavedAt(new Date());
    else setGlobalError(r.detail ?? r.error);
  }

  function goNext() {
    setGlobalError(null);
    if (step < 6) setStep(step + 1);
  }
  function goBack() {
    setGlobalError(null);
    if (step > 1) setStep(step - 1);
  }

  // Per-step ready check. Empty steps still move forward — the wizard's
  // friendly: it asks "are you sure?" only on go-live.
  function stepReady(n: number): boolean {
    if (n === 1) {
      const r = draft.restaurantInfo;
      return r.phone.trim().length >= 6 && r.city.trim().length >= 2;
    }
    if (n === 2) {
      // Brand step is optional — patron can skip
      return true;
    }
    if (n === 3) {
      return props.sourceState.menu_added || draft.menu.source === 'manual';
    }
    if (n === 4) {
      return props.sourceState.zones_set || draft.delivery.tier !== null;
    }
    if (n === 5) {
      return draft.payment.cod_enabled === true; // we require COD for now
    }
    if (n === 6) {
      return (
        props.sourceState.menu_added &&
        props.sourceState.zones_set &&
        props.sourceState.hours_set
      );
    }
    return false;
  }

  const completedRemaining = STEPS.slice(step - 1).reduce((s, x) => s + x.estMinutes, 0);

  return (
    <div className="flex flex-col gap-5">
      {/* Sticky progress bar */}
      <div className="sticky top-0 z-10 -mx-4 border-b border-zinc-200 bg-white/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border sm:px-5">
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs font-medium text-zinc-700">
            Pasul <strong>{step}</strong> din 6 ·{' '}
            <span className="text-zinc-500">~{completedRemaining} min rămas</span>
          </div>
          <div className="text-[11px] text-zinc-400">
            {savedAt
              ? `Salvat la ${savedAt.toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' })}`
              : pending
                ? 'Se salvează…'
                : 'Salvare automată activă'}
          </div>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-200">
          <div
            className="h-full bg-emerald-500 transition-all"
            style={{ width: `${((step - 1) / 6) * 100}%` }}
          />
        </div>
        <ol className="mt-2 hidden grid-cols-6 gap-1 text-[10px] sm:grid">
          {STEPS.map((s) => (
            <li
              key={s.num}
              className={
                'truncate text-center ' +
                (s.num < step
                  ? 'text-emerald-600'
                  : s.num === step
                    ? 'font-semibold text-zinc-900'
                    : 'text-zinc-400')
              }
            >
              {s.num}. {s.shortLabel}
            </li>
          ))}
        </ol>
      </div>

      {/* Step body */}
      <div className="rounded-xl border border-zinc-200 bg-white p-5 sm:p-6">
        {step === 1 && (
          <Step1
            value={draft.restaurantInfo}
            onChange={(v) => patchDraft({ restaurantInfo: v })}
            tenantId={props.tenantId}
            disabled={!props.canEdit}
            onError={setGlobalError}
            cities={props.cities}
          />
        )}
        {step === 2 && (
          <Step2
            tenantId={props.tenantId}
            initialLogoUrl={props.persisted.logo_url}
            initialBrandColor={props.persisted.brand_color ?? '#0F172A'}
            disabled={!props.canEdit}
            onError={setGlobalError}
            skipped={draft.brand.skipped}
            onSkip={(skipped) => patchDraft({ brand: { skipped } })}
          />
        )}
        {step === 3 && (
          <Step3
            tenantSlug={props.tenantSlug}
            menuAdded={props.sourceState.menu_added}
            source={draft.menu.source}
            onSource={(source) => patchDraft({ menu: { source } })}
          />
        )}
        {step === 4 && (
          <Step4
            zonesSet={props.sourceState.zones_set}
            hoursSet={props.sourceState.hours_set}
            tier={draft.delivery.tier}
            onTier={(tier) => patchDraft({ delivery: { tier } })}
          />
        )}
        {step === 5 && (
          <Step5
            tenantId={props.tenantId}
            cod_enabled={draft.payment.cod_enabled}
            onCodEnabled={(cod_enabled) => patchDraft({ payment: { cod_enabled } })}
            disabled={!props.canEdit}
            onError={setGlobalError}
          />
        )}
        {step === 6 && (
          <Step6
            sourceState={props.sourceState}
            tenantId={props.tenantId}
            tenantSlug={props.tenantSlug}
            disabled={!props.canEdit}
            onError={setGlobalError}
            onLive={() => router.push('/dashboard/orders')}
          />
        )}
      </div>

      {globalError && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {globalError}
        </div>
      )}

      {/* Footer nav */}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={goBack}
            disabled={step === 1 || pending}
            className="inline-flex items-center justify-center rounded-md border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            ← Înapoi
          </button>
          <button
            type="button"
            onClick={() => startTransition(() => void saveNow())}
            disabled={pending}
            className="inline-flex items-center justify-center rounded-md border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
          >
            Salvează schiță
          </button>
        </div>
        {step < 6 && (
          <button
            type="button"
            onClick={async () => {
              if (step === 1) {
                // Persist Step-1 contact info on next.
                const r = await saveRestaurantInfo({
                  tenantId: props.tenantId,
                  phone: draft.restaurantInfo.phone,
                  address: draft.restaurantInfo.address,
                  city: draft.restaurantInfo.city,
                  city_id: draft.restaurantInfo.city_id,
                  location_lat: draft.restaurantInfo.location_lat,
                  location_lng: draft.restaurantInfo.location_lng,
                });
                if (!r.ok) {
                  setGlobalError(r.detail ?? r.error);
                  return;
                }
              }
              if (step === 5) {
                const r = await saveCodEnabled({
                  tenantId: props.tenantId,
                  cod_enabled: draft.payment.cod_enabled,
                });
                if (!r.ok) {
                  setGlobalError(r.detail ?? r.error);
                  return;
                }
              }
              goNext();
            }}
            disabled={!stepReady(step) || pending}
            className="inline-flex items-center justify-center rounded-md bg-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-zinc-300"
          >
            Continuă →
          </button>
        )}
      </div>

      <p className="text-[11px] text-zinc-400">
        Total estimat: ~{TOTAL_EST} min · Salvăm automat la fiecare modificare.
      </p>
    </div>
  );
}

// ───────────────────────────── Step 1 ─────────────────────────────
function Step1({
  value,
  onChange,
  disabled,
  cities,
}: {
  value: WizardDraft['restaurantInfo'];
  onChange: (v: WizardDraft['restaurantInfo']) => void;
  tenantId: string;
  disabled: boolean;
  onError: (e: string | null) => void;
  cities: CityOption[];
}) {
  // Lane MULTI-CITY: pre-select the dropdown when:
  //   1. user already picked a city_id earlier (resume case), OR
  //   2. legacy free-text matches a canonical city name (case-insensitive,
  //      diacritic-tolerant via Intl.Collator).
  // If neither matches we leave the dropdown on "" and the free-text input
  // captures whatever the user types.
  const collator = new Intl.Collator('ro', { sensitivity: 'base' });
  const matchedFromText = !value.city_id && value.city
    ? cities.find((c) => collator.compare(c.name, value.city) === 0)
    : null;
  const selectedSlug = value.city_id
    ? cities.find((c) => c.id === value.city_id)?.slug ?? ''
    : matchedFromText?.slug ?? '';

  function onCityPick(slug: string) {
    if (slug === '') {
      // "Orașul nu este în listă" — keep free-text, drop FK.
      onChange({ ...value, city_id: null });
      return;
    }
    const city = cities.find((c) => c.slug === slug);
    if (!city) return;
    onChange({ ...value, city_id: city.id, city: city.name });
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h2 className="text-base font-semibold text-zinc-900">Detaliile restaurantului</h2>
        <p className="text-sm text-zinc-600">
          Numărul de telefon apare pe storefront. Adresa e folosită pentru a calcula
          distanțele de livrare.
        </p>
      </header>

      <Field label="Telefon contact (apare pe storefront)" required>
        <input
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={value.phone}
          disabled={disabled}
          onChange={(e) => onChange({ ...value, phone: e.target.value })}
          placeholder="07xx xxx xxx"
          className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2.5 text-base focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 sm:text-sm"
        />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <Field label="Adresa">
            <input
              type="text"
              autoComplete="street-address"
              value={value.address}
              disabled={disabled}
              onChange={(e) => onChange({ ...value, address: e.target.value })}
              placeholder="ex: Str. Republicii 12"
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2.5 text-base focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 sm:text-sm"
            />
          </Field>
        </div>
        <Field label="Oraș" required>
          <select
            value={selectedSlug}
            disabled={disabled || cities.length === 0}
            onChange={(e) => onCityPick(e.target.value)}
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2.5 text-base focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 sm:text-sm"
          >
            <option value="">Alegeți orașul…</option>
            {cities.map((c) => (
              <option key={c.id} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {/* Lane MULTI-CITY: free-text fallback for cities not yet in the
          dropdown. Dezbrăcat de FK pentru ca un oraș nou (ex: Bistrița) să
          rămână în settings.city până când admin-ul îl adaugă în listă. */}
      {selectedSlug === '' && (
        <Field label="Orașul nu este în listă? Tastați manual">
          <input
            type="text"
            autoComplete="address-level2"
            value={value.city}
            disabled={disabled}
            onChange={(e) => onChange({ ...value, city: e.target.value, city_id: null })}
            placeholder="ex: Bistrița"
            className="w-full rounded-md border border-dashed border-zinc-300 bg-white px-3 py-2.5 text-base focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 sm:text-sm"
          />
          <p className="mt-1 text-xs text-zinc-500">
            Trimiteți un mesaj la <a href="mailto:contact@hir.ro" className="underline">contact@hir.ro</a> ca să adăugăm orașul în listă.
          </p>
        </Field>
      )}

      <details className="rounded-md border border-dashed border-zinc-300 px-3 py-2 text-sm text-zinc-600">
        <summary className="cursor-pointer font-medium text-zinc-700">
          Setează coordonate exacte (opțional, recomandat)
        </summary>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Field label="Latitudine">
            <input
              type="number"
              step="0.000001"
              value={value.location_lat ?? ''}
              disabled={disabled}
              onChange={(e) =>
                onChange({
                  ...value,
                  location_lat: e.target.value === '' ? null : Number(e.target.value),
                })
              }
              placeholder="45.6"
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
            />
          </Field>
          <Field label="Longitudine">
            <input
              type="number"
              step="0.000001"
              value={value.location_lng ?? ''}
              disabled={disabled}
              onChange={(e) =>
                onChange({
                  ...value,
                  location_lng: e.target.value === '' ? null : Number(e.target.value),
                })
              }
              placeholder="25.6"
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
            />
          </Field>
          <p className="col-span-2 text-xs text-zinc-500">
            Tip: deschide{' '}
            <a
              href="https://www.google.com/maps"
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              Google Maps
            </a>
            , click-dreapta pe locația restaurantului → primele două numere sunt lat / lng.
          </p>
        </div>
      </details>
    </div>
  );
}

// ───────────────────────────── Step 2 ─────────────────────────────
function Step2({
  tenantId,
  initialLogoUrl,
  initialBrandColor,
  disabled,
  onError,
  skipped,
  onSkip,
}: {
  tenantId: string;
  initialLogoUrl: string | null;
  initialBrandColor: string;
  disabled: boolean;
  onError: (e: string | null) => void;
  skipped: boolean;
  onSkip: (s: boolean) => void;
}) {
  const [logoUrl, setLogoUrl] = useState<string | null>(initialLogoUrl);
  const [color, setColor] = useState<string>(
    HEX_RE.test(initialBrandColor) ? initialBrandColor : '#0F172A',
  );
  const [uploading, setUploading] = useState(false);

  async function onLogoFile(file: File) {
    onError(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.set('kind', 'logo');
      fd.set('file', file);
      fd.set('tenantId', tenantId);
      const r = await uploadBrandingAsset(fd);
      if (!r.ok) {
        onError(r.detail ?? r.error);
        return;
      }
      setLogoUrl(r.branding.logo_url ?? null);
    } finally {
      setUploading(false);
    }
  }

  async function onColorChange(hex: string) {
    if (!HEX_RE.test(hex)) return;
    setColor(hex);
    onError(null);
    const r = await setBrandColor(hex, tenantId);
    if (!r.ok) onError(r.detail ?? r.error);
  }

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h2 className="text-base font-semibold text-zinc-900">Identitate vizuală</h2>
        <p className="text-sm text-zinc-600">
          Logo + culoare de brand. Apar pe storefront, pe e-mailul de confirmare a
          comenzii și pe AI CEO. Poți sări peste — adaugi mai târziu din Setări.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        {/* Logo */}
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-zinc-700">Logo</span>
          <div className="flex items-center gap-3 rounded-lg border border-dashed border-zinc-300 p-3">
            {logoUrl ? (
              // Preview from storage. Decoding async so the wizard stays snappy.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logoUrl}
                alt="logo"
                className="h-16 w-16 rounded-md border border-zinc-200 bg-white object-contain"
                decoding="async"
                loading="lazy"
              />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-md border border-zinc-200 bg-zinc-50 text-xs text-zinc-400">
                Niciun logo
              </div>
            )}
            <label className="inline-flex cursor-pointer items-center rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50">
              {uploading ? 'Se încarcă…' : logoUrl ? 'Înlocuiește' : 'Încarcă logo'}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                disabled={disabled || uploading}
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void onLogoFile(f);
                }}
              />
            </label>
          </div>
          <p className="text-xs text-zinc-500">
            PNG / JPG / WebP, max 4 MB. Pătrat sau rotund, min 256×256.
          </p>
        </div>

        {/* Color */}
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-zinc-700">Culoare de brand</span>
          <div className="flex items-center gap-3 rounded-lg border border-zinc-300 p-3">
            <input
              type="color"
              value={color}
              disabled={disabled}
              onChange={(e) => void onColorChange(e.target.value.toLowerCase())}
              className="h-12 w-12 cursor-pointer rounded-md border border-zinc-200"
              aria-label="Selector culoare"
            />
            <input
              type="text"
              value={color}
              disabled={disabled}
              onChange={(e) => {
                const v = e.target.value.trim().toLowerCase();
                setColor(v);
                if (HEX_RE.test(v)) void onColorChange(v);
              }}
              maxLength={7}
              className="w-28 rounded-md border border-zinc-300 bg-white px-2 py-1.5 font-mono text-sm uppercase"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Folosește ${c}`}
                onClick={() => void onColorChange(c)}
                disabled={disabled}
                className="h-7 w-7 rounded-full border border-zinc-200 transition hover:scale-110"
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-zinc-600">
        <input
          type="checkbox"
          checked={skipped}
          onChange={(e) => onSkip(e.target.checked)}
          className="rounded border-zinc-300"
        />
        Adaug brandul mai târziu — sări peste pasul ăsta.
      </label>
    </div>
  );
}

// ───────────────────────────── Step 3 ─────────────────────────────
function Step3({
  tenantSlug,
  menuAdded,
  source,
  onSource,
}: {
  tenantSlug: string;
  menuAdded: boolean;
  source: 'master_key' | 'csv' | 'manual' | null;
  onSource: (s: 'master_key' | 'csv' | 'manual' | null) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h2 className="text-base font-semibold text-zinc-900">Meniu</h2>
        <p className="text-sm text-zinc-600">
          {menuAdded
            ? 'Meniul are deja produse — perfect. Poți reveni să-l completezi oricând.'
            : 'Alege cum aduci meniul. Recomandat: GloriaFood Master Key (cel mai rapid).'}
        </p>
      </header>

      {menuAdded ? (
        <div className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          <span aria-hidden>✓</span>
          <div>
            Produsele sunt deja adăugate.{' '}
            <Link href="/dashboard/menu" className="font-medium underline">
              Deschide meniul
            </Link>
            .
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <SourceCard
            selected={source === 'master_key'}
            onClick={() => onSource('master_key')}
            title="GloriaFood Master Key"
            badge="Recomandat"
            description="Lipești cheia, vezi preview, importăm tot meniul în <2 min."
            href="/dashboard/onboarding/migrate-from-gloriafood/master-key"
            cta="Importă din GloriaFood"
          />
          <SourceCard
            selected={source === 'csv'}
            onClick={() => onSource('csv')}
            title="Fișier CSV"
            description="Ai un export GloriaFood / Excel? Încarci fișierul și mapăm coloanele."
            href="/dashboard/onboarding/migrate-from-gloriafood"
            cta="Încarcă CSV"
          />
          <SourceCard
            selected={source === 'manual'}
            onClick={() => onSource('manual')}
            title="Adaug manual"
            description="Construiești meniul direct, categorie cu categorie."
            href="/dashboard/menu"
            cta="Deschide meniul"
          />
        </div>
      )}

      {!menuAdded && source === 'manual' && (
        <p className="text-xs text-zinc-500">
          Tip: poți reveni la asistent oricând. Storefront-ul tău:{' '}
          <code className="font-mono text-zinc-700">{tenantSlug}</code>
        </p>
      )}
    </div>
  );
}

function SourceCard({
  selected,
  onClick,
  title,
  badge,
  description,
  href,
  cta,
}: {
  selected: boolean;
  onClick: () => void;
  title: string;
  badge?: string;
  description: string;
  href: string;
  cta: string;
}) {
  return (
    <div
      className={
        'flex flex-col gap-3 rounded-xl border p-4 transition ' +
        (selected
          ? 'border-indigo-400 bg-indigo-50/50 ring-1 ring-indigo-200'
          : 'border-zinc-200 bg-white hover:border-zinc-300')
      }
    >
      <button type="button" onClick={onClick} className="flex flex-col items-start gap-1 text-left">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-zinc-900">{title}</span>
          {badge && (
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-700">
              {badge}
            </span>
          )}
        </div>
        <p className="text-xs text-zinc-600">{description}</p>
      </button>
      <Link
        href={href}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center justify-center rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
      >
        {cta} →
      </Link>
    </div>
  );
}

// ───────────────────────────── Step 4 ─────────────────────────────
function Step4({
  zonesSet,
  hoursSet,
  tier,
  onTier,
}: {
  zonesSet: boolean;
  hoursSet: boolean;
  tier: 'tier_1' | 'tier_2' | null;
  onTier: (t: 'tier_1' | 'tier_2' | null) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h2 className="text-base font-semibold text-zinc-900">Livrare</h2>
        <p className="text-sm text-zinc-600">
          Alege tariful HIR și definește zona pe hartă. Cel puțin o zonă e
          necesară pentru a accepta comenzi.
        </p>
      </header>

      {/* Tier selection */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <TierCard
          selected={tier === 'tier_1'}
          onClick={() => onTier('tier_1')}
          title="Tier 1 · 3 RON / livrare"
          subtitle="Tarif fix per comandă livrată"
          description="Plătești HIR doar 3 RON pentru fiecare comandă livrată. Tu stabilești tariful pe care îl percepi clientului."
        />
        <TierCard
          selected={tier === 'tier_2'}
          onClick={() => onTier('tier_2')}
          title="Tier 2 · cost curier + 3 RON HIR"
          subtitle="Pasezi costul curierului către client"
          description="Costul real al curierului HIR + 3 RON per comandă. Recomandat dacă vrei transparență totală în storefront."
        />
      </div>

      {/* Zones map link */}
      <div
        className={
          'flex items-start gap-3 rounded-lg border p-4 ' +
          (zonesSet
            ? 'border-emerald-200 bg-emerald-50'
            : 'border-amber-200 bg-amber-50')
        }
      >
        <span aria-hidden className={zonesSet ? 'text-emerald-700' : 'text-amber-700'}>
          {zonesSet ? '✓' : '!'}
        </span>
        <div className="flex flex-1 flex-col gap-2">
          <p className="text-sm">
            {zonesSet
              ? 'Ai cel puțin o zonă de livrare definită.'
              : 'Trasează cel puțin o zonă pe hartă pentru a putea accepta comenzi.'}
          </p>
          <Link
            href="/dashboard/zones"
            target="_blank"
            rel="noreferrer"
            className="inline-flex w-fit items-center rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
          >
            {zonesSet ? 'Editează zone' : 'Trasează zone pe hartă'} →
          </Link>
        </div>
      </div>

      {/* Hours */}
      <div
        className={
          'flex items-start gap-3 rounded-lg border p-4 ' +
          (hoursSet ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50')
        }
      >
        <span aria-hidden className={hoursSet ? 'text-emerald-700' : 'text-amber-700'}>
          {hoursSet ? '✓' : '!'}
        </span>
        <div className="flex flex-1 flex-col gap-2">
          <p className="text-sm">
            {hoursSet
              ? 'Programul de funcționare e configurat.'
              : 'Setează programul săptămânal — în afara intervalului storefront-ul afișează „Închis".'}
          </p>
          <Link
            href="/dashboard/settings/operations"
            target="_blank"
            rel="noreferrer"
            className="inline-flex w-fit items-center rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
          >
            {hoursSet ? 'Editează program' : 'Setează program'} →
          </Link>
        </div>
      </div>
    </div>
  );
}

function TierCard({
  selected,
  onClick,
  title,
  subtitle,
  description,
}: {
  selected: boolean;
  onClick: () => void;
  title: string;
  subtitle: string;
  description: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'flex flex-col items-start gap-1 rounded-xl border p-4 text-left transition ' +
        (selected
          ? 'border-indigo-400 bg-indigo-50/50 ring-1 ring-indigo-200'
          : 'border-zinc-200 bg-white hover:border-zinc-300')
      }
    >
      <span className="text-sm font-semibold text-zinc-900">{title}</span>
      <span className="text-xs font-medium text-zinc-600">{subtitle}</span>
      <p className="mt-1 text-xs text-zinc-600">{description}</p>
    </button>
  );
}

// ───────────────────────────── Step 5 ─────────────────────────────
function Step5({
  cod_enabled,
  onCodEnabled,
  disabled,
}: {
  tenantId: string;
  cod_enabled: boolean;
  onCodEnabled: (v: boolean) => void;
  disabled: boolean;
  onError: (e: string | null) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h2 className="text-base font-semibold text-zinc-900">Plăți</h2>
        <p className="text-sm text-zinc-600">
          Pornim cu numerar la livrare („cash&rdquo;). Plățile cu cardul (Stripe Connect)
          se activează ulterior, după contractul cu HIR.
        </p>
      </header>

      <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-zinc-200 bg-white p-4">
        <input
          type="checkbox"
          checked={cod_enabled}
          disabled={disabled}
          onChange={(e) => onCodEnabled(e.target.checked)}
          className="mt-0.5 rounded border-zinc-300"
        />
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-medium text-zinc-900">
            Acceptă numerar la livrare (COD)
          </span>
          <span className="text-xs text-zinc-600">
            Clientul plătește curierului HIR la livrare. Comanda apare imediat în
            tablou ca „de pregătit&rdquo;, fără verificare bancară.
          </span>
        </div>
      </label>

      <div className="flex items-start gap-3 rounded-lg border border-zinc-200 bg-zinc-50 p-4">
        <span aria-hidden className="text-zinc-400">🔒</span>
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium text-zinc-700">
            Plăți cu cardul (Stripe Connect)
          </span>
          <span className="text-xs text-zinc-500">
            În curând. Necesită contract HIR + verificare KYB. Te anunțăm când e
            disponibil pentru pilotul Brașov.
          </span>
        </div>
      </div>
    </div>
  );
}

// ───────────────────────────── Step 6 ─────────────────────────────
function Step6({
  sourceState,
  tenantId,
  tenantSlug,
  disabled,
  onError,
  onLive,
}: {
  sourceState: SourceState;
  tenantId: string;
  tenantSlug: string;
  disabled: boolean;
  onError: (e: string | null) => void;
  onLive: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const ready =
    sourceState.menu_added && sourceState.zones_set && sourceState.hours_set;

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h2 className="text-base font-semibold text-zinc-900">Activează comenzile</h2>
        <p className="text-sm text-zinc-600">
          Ultima verificare. Dacă tot ce e mai jos e bifat, storefront-ul devine
          public și începe să primească comenzi.
        </p>
      </header>

      <ul className="flex flex-col gap-2">
        <ChecklistItem ok={sourceState.menu_added} label="Meniu cu cel puțin un produs" />
        <ChecklistItem ok={sourceState.hours_set} label="Program de funcționare configurat" />
        <ChecklistItem ok={sourceState.zones_set} label="Cel puțin o zonă de livrare" />
      </ul>

      <div className="flex flex-col gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
        <p className="text-sm font-medium text-emerald-900">
          Storefront public:{' '}
          <a
            href={tenantStorefrontUrl(tenantSlug)}
            target="_blank"
            rel="noreferrer"
            className="font-mono underline"
          >
            {tenantStorefrontUrl(tenantSlug).replace(/^https?:\/\//, '')}
          </a>
        </p>
        <p className="text-xs text-emerald-800">
          După activare, redirecționăm la <strong>/dashboard/orders</strong> ca să
          vezi prima comandă în timp real.
        </p>
      </div>

      <button
        type="button"
        disabled={!ready || pending || disabled}
        onClick={() =>
          startTransition(async () => {
            onError(null);
            const r = await wizardGoLive({ tenantId });
            if (!r.ok) {
              onError(r.detail ?? r.error);
              return;
            }
            onLive();
          })
        }
        className="inline-flex items-center justify-center rounded-md bg-emerald-600 px-5 py-3 text-base font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-zinc-300"
      >
        {pending ? 'Se activează…' : ready ? 'Activează comenzi acum' : 'Completează pașii 1-5 mai întâi'}
      </button>
    </div>
  );
}

function ChecklistItem({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li
      className={
        'flex items-center gap-2 rounded-md border px-3 py-2 text-sm ' +
        (ok ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-zinc-200 bg-zinc-50 text-zinc-600')
      }
    >
      <span aria-hidden className={ok ? 'text-emerald-600' : 'text-zinc-400'}>
        {ok ? '✓' : '○'}
      </span>
      {label}
    </li>
  );
}

// ───────────────────────────── primitives ─────────────────────────────
function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-zinc-700">
        {label}
        {required && <span className="ml-1 text-rose-500">*</span>}
      </span>
      {children}
    </label>
  );
}
