'use client';

import { useRef, useState } from 'react';
import type { WizardForm } from './wizard';

const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const MAX_BYTES = 4 * 1024 * 1024;
const ACCEPT = 'image/png,image/jpeg,image/webp';

const COLOR_PRESETS = [
  { hex: '#e53e3e', label: 'Roșu' },
  { hex: '#ed8936', label: 'Portocaliu' },
  { hex: '#d69e2e', label: 'Galben' },
  { hex: '#38a169', label: 'Verde' },
  { hex: '#3182ce', label: 'Albastru' },
  { hex: '#7c3aed', label: 'Violet' },
] as const;

const RESTAURANT_TYPE_LABELS: Record<string, string> = {
  pizzerie: 'Pizzerie',
  burger: 'Burger / Fast-food',
  'kebab-shaorma': 'Kebab / Shaorma',
  sushi: 'Sushi / Asian',
  cafenea: 'Cafenea / Patiserie',
  mixt: 'Meniu mixt',
};

type Props = {
  form: WizardForm;
  onChange: (patch: Partial<WizardForm>) => void;
  onBack: () => void;
  onSubmit: () => Promise<void>;
  submitting: boolean;
  error: string | null;
};

export function StepBrand({ form, onChange, onBack, onSubmit, submitting, error }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);

  const colorValid = !form.brandColor || HEX_RE.test(form.brandColor);
  const previewColor = colorValid && form.brandColor ? form.brandColor : '#7c3aed';

  function handleFile(file: File | null | undefined) {
    if (!file) return;
    setFileError(null);
    if (file.size > MAX_BYTES) {
      setFileError('Fișierul depășește 4 MB. Alege o imagine mai mică.');
      return;
    }
    const url = URL.createObjectURL(file);
    onChange({ logoFile: file, logoPreviewUrl: url });
  }

  const cityLabel = form.cityId ? form.cityId : null;

  return (
    <div className="flex flex-col gap-5">
      {/* Brand identity card */}
      <div className="rounded-xl border border-zinc-200 bg-white p-6">
        <h2 className="text-base font-semibold text-zinc-900">Identitate vizuală</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Totul este opțional — poți completa mai târziu din Configurare.
        </p>

        <div className="mt-5 flex flex-col gap-5">
          {/* Logo upload */}
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-zinc-700">
              Logo restaurant{' '}
              <span className="text-xs font-normal text-zinc-400">(opțional)</span>
            </span>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
              {/* Drop zone / preview */}
              <div
                role="button"
                tabIndex={0}
                aria-label="Trage logo-ul aici sau apasă pentru a selecta"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click();
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  handleFile(e.dataTransfer.files?.[0]);
                }}
                onClick={() => fileInputRef.current?.click()}
                className={[
                  'flex h-28 w-28 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-2xl border-2 transition-colors',
                  dragOver
                    ? 'border-indigo-500 bg-indigo-50'
                    : 'border-dashed border-zinc-300 bg-zinc-50 hover:border-zinc-400',
                ].join(' ')}
              >
                {form.logoPreviewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={form.logoPreviewUrl}
                    alt="Preview logo"
                    width={112}
                    height={112}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <svg
                    viewBox="0 0 24 24"
                    className="h-8 w-8 text-zinc-300"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.5}
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3 10.5V6.75A2.25 2.25 0 015.25 4.5h13.5A2.25 2.25 0 0121 6.75v10.5A2.25 2.25 0 0118.75 19.5H5.25A2.25 2.25 0 013 17.25V10.5z"
                    />
                  </svg>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPT}
                  className="hidden"
                  aria-label="Selectează logo"
                  onChange={(e) => handleFile(e.target.files?.[0])}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="self-start rounded-md border border-zinc-300 bg-white px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                >
                  {form.logoFile ? 'Schimbă logo' : 'Selectează logo'}
                </button>
                <p className="text-xs text-zinc-400">
                  PNG, JPEG sau WebP — max 4 MB
                </p>
                {form.logoFile && (
                  <p className="text-xs text-emerald-600">
                    {form.logoFile.name}
                  </p>
                )}
              </div>
            </div>
            {fileError && (
              <p className="text-xs text-rose-600" role="alert">
                {fileError}
              </p>
            )}
          </div>

          {/* Brand color */}
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-zinc-700">
              Culoare principală{' '}
              <span className="text-xs font-normal text-zinc-400">(opțional)</span>
            </span>
            <div className="flex flex-wrap items-center gap-2">
              {COLOR_PRESETS.map((p) => (
                <button
                  key={p.hex}
                  type="button"
                  aria-label={`Culoare ${p.label}`}
                  onClick={() => onChange({ brandColor: p.hex })}
                  className={[
                    'h-8 w-8 rounded-full border-2 transition-transform hover:scale-110',
                    form.brandColor === p.hex
                      ? 'border-zinc-900 ring-2 ring-zinc-900 ring-offset-1'
                      : 'border-transparent',
                  ].join(' ')}
                  style={{ backgroundColor: p.hex }}
                />
              ))}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={HEX_RE.test(form.brandColor) ? form.brandColor : '#7c3aed'}
                onChange={(e) => onChange({ brandColor: e.target.value })}
                aria-label="Alege culoare personalizată"
                className="h-9 w-12 cursor-pointer rounded-md border border-zinc-300"
              />
              <input
                type="text"
                value={form.brandColor}
                onChange={(e) =>
                  onChange({ brandColor: e.target.value.slice(0, 7) })
                }
                maxLength={7}
                placeholder="#7c3aed"
                aria-label="Hex culoare brand"
                className="w-28 rounded-md border border-zinc-300 px-3 py-2 font-mono text-sm uppercase focus:border-indigo-500 focus:outline-none"
              />
              <span
                aria-hidden="true"
                className="inline-flex h-9 items-center rounded-md px-3 text-xs font-semibold text-white"
                style={{ backgroundColor: previewColor }}
              >
                Comandă
              </span>
            </div>
            {!colorValid && form.brandColor && (
              <p className="text-xs text-rose-600">Format invalid. Folosește #rrggbb.</p>
            )}
          </div>

          {/* Tagline */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="tagline" className="text-sm font-medium text-zinc-700">
              Slogan{' '}
              <span className="text-xs font-normal text-zinc-400">(opțional)</span>
            </label>
            <input
              id="tagline"
              type="text"
              value={form.tagline}
              onChange={(e) => onChange({ tagline: e.target.value })}
              maxLength={100}
              placeholder="Cea mai bună pizza din Brașov"
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        </div>
      </div>

      {/* Summary preview */}
      <div className="rounded-xl border border-zinc-200 bg-white p-6">
        <h3 className="text-sm font-semibold text-zinc-700">Rezumat cont nou</h3>
        <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
          <SummaryRow label="Nume" value={form.restaurantName} />
          <SummaryRow label="Slug" value={form.slug} mono />
          {form.restaurantType && (
            <SummaryRow
              label="Tip"
              value={RESTAURANT_TYPE_LABELS[form.restaurantType] ?? form.restaurantType}
            />
          )}
          <SummaryRow label="Email" value={form.email} />
          {form.phone && <SummaryRow label="Telefon" value={form.phone} />}
          {cityLabel && <SummaryRow label="Oraș" value={cityLabel} />}
          {form.address && <SummaryRow label="Adresă" value={form.address} />}
          {form.tagline && <SummaryRow label="Slogan" value={`"${form.tagline}"`} />}
        </dl>
        {/* Color swatch */}
        {form.brandColor && colorValid && (
          <div className="mt-3 flex items-center gap-2">
            <span className="text-xs text-zinc-500">Culoare brand:</span>
            <span
              className="inline-block h-5 w-5 rounded-full border border-zinc-200"
              style={{ backgroundColor: form.brandColor }}
              aria-label={`Culoare ${form.brandColor}`}
            />
            <span className="font-mono text-xs text-zinc-600">{form.brandColor}</span>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div
          className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
          role="alert"
        >
          {error}
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          disabled={submitting}
          className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 bg-white px-5 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
        >
          <svg
            viewBox="0 0 20 20"
            fill="currentColor"
            className="h-4 w-4"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z"
              clipRule="evenodd"
            />
          </svg>
          Înapoi
        </button>

        <button
          type="button"
          onClick={onSubmit}
          disabled={submitting}
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? (
            <>
              <svg
                className="h-4 w-4 animate-spin"
                fill="none"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              Se creează contul...
            </>
          ) : (
            'Finalizează — Hepi te salută'
          )}
        </button>
      </div>
    </div>
  );
}

function SummaryRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col">
      <dt className="text-xs font-medium uppercase tracking-wide text-zinc-400">{label}</dt>
      <dd className={`mt-0.5 truncate text-sm text-zinc-800 ${mono ? 'font-mono' : ''}`}>
        {value}
      </dd>
    </div>
  );
}
