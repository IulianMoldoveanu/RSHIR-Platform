'use client';

import { useEffect, useState } from 'react';
import type { WizardForm } from './wizard';
import type { CityRow } from '@/lib/cities';

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
const PHONE_RE = /^\+40[0-9]{9}$|^07[0-9]{8}$/;

const RESTAURANT_TYPES = [
  { value: 'pizzerie', label: 'Pizzerie' },
  { value: 'burger', label: 'Burger / Fast-food' },
  { value: 'kebab-shaorma', label: 'Kebab / Shaorma' },
  { value: 'sushi', label: 'Sushi / Asian' },
  { value: 'cafenea', label: 'Cafenea / Patiserie' },
  { value: 'mixt', label: 'Meniu mixt' },
] as const;

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    // eslint-disable-next-line no-misleading-character-class
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30);
}

function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string | null;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium text-zinc-700">
        {label}
        {required && <span className="ml-1 text-rose-500">*</span>}
      </label>
      {children}
      {error ? (
        <span className="text-xs text-rose-600" role="alert">
          {error}
        </span>
      ) : hint ? (
        <span className="text-xs text-zinc-500">{hint}</span>
      ) : null}
    </div>
  );
}

type Props = {
  form: WizardForm;
  onChange: (patch: Partial<WizardForm>) => void;
  onNext: () => void;
  cities: CityRow[];
  primaryDomain: string;
};

export function StepRestaurant({ form, onChange, onNext, cities, primaryDomain }: Props) {
  const [slugTouched, setSlugTouched] = useState(false);
  const [triedNext, setTriedNext] = useState(false);

  // Auto-generate slug from name until user manually edits it
  useEffect(() => {
    if (!slugTouched) {
      onChange({ slug: slugify(form.restaurantName) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.restaurantName]);

  const slugValid =
    form.slug.length >= 3 && form.slug.length <= 30 && SLUG_RE.test(form.slug);
  const phoneValid = !form.phone || PHONE_RE.test(form.phone.replace(/\s/g, ''));

  const errors = {
    restaurantName:
      triedNext && form.restaurantName.trim().length < 2
        ? 'Numele trebuie să aibă minim 2 caractere.'
        : null,
    slug:
      triedNext && !slugValid
        ? 'Slug invalid — 3-30 caractere, doar litere mici, cifre și "-".'
        : null,
    restaurantType:
      triedNext && !form.restaurantType ? 'Selectează tipul restaurantului.' : null,
    phone:
      triedNext && form.phone && !phoneValid
        ? 'Format invalid. Folosește: 07xx xxx xxx sau +40xxx.'
        : null,
  };

  function handleNext() {
    setTriedNext(true);
    if (
      form.restaurantName.trim().length < 2 ||
      !slugValid ||
      !form.restaurantType ||
      (form.phone && !phoneValid)
    ) {
      return;
    }
    onNext();
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-xl border border-zinc-200 bg-white p-6">
        <h2 className="text-base font-semibold text-zinc-900">Detalii restaurant</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Completați informațiile de bază. Durează mai puțin de 2 minute.
        </p>

        <div className="mt-5 flex flex-col gap-4">
          <Field
            label="Nume restaurant"
            htmlFor="restaurantName"
            required
            error={errors.restaurantName}
          >
            <input
              id="restaurantName"
              type="text"
              value={form.restaurantName}
              onChange={(e) => onChange({ restaurantName: e.target.value })}
              maxLength={100}
              autoComplete="organization"
              placeholder="ex: Foișorul A"
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </Field>

          <Field
            label="Adresă web (slug)"
            htmlFor="slug"
            required
            hint={
              form.slug
                ? `https://${form.slug}.${primaryDomain}`
                : `https://<slug>.${primaryDomain}`
            }
            error={errors.slug}
          >
            <input
              id="slug"
              type="text"
              value={form.slug}
              onChange={(e) => {
                onChange({ slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') });
                setSlugTouched(true);
              }}
              minLength={3}
              maxLength={30}
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 font-mono text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              placeholder="foisorul-a"
            />
          </Field>

          <Field
            label="Tip restaurant"
            htmlFor="restaurantType"
            required
            error={errors.restaurantType}
          >
            <select
              id="restaurantType"
              value={form.restaurantType}
              onChange={(e) =>
                onChange({ restaurantType: e.target.value as WizardForm['restaurantType'] })
              }
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="">Selectează tipul...</option>
              {RESTAURANT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Oraș" htmlFor="cityId">
              {cities.length > 0 ? (
                <select
                  id="cityId"
                  value={form.cityId}
                  onChange={(e) => onChange({ cityId: e.target.value })}
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="">Selectează orașul...</option>
                  {cities.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.county ? ` (${c.county})` : ''}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  id="cityId"
                  type="text"
                  value={form.cityId}
                  onChange={(e) => onChange({ cityId: e.target.value })}
                  placeholder="Brașov"
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              )}
            </Field>

            <Field label="Stradă și număr" htmlFor="address" hint="Opțional — ajută la livrare">
              <input
                id="address"
                type="text"
                value={form.address}
                onChange={(e) => onChange({ address: e.target.value })}
                maxLength={200}
                placeholder="Str. Lungă nr. 12"
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </Field>
          </div>

          <Field
            label="Telefon proprietar"
            htmlFor="phone"
            hint="Format: 07xx xxx xxx sau +40xxx"
            error={errors.phone}
          >
            <input
              id="phone"
              type="tel"
              value={form.phone}
              onChange={(e) => onChange({ phone: e.target.value })}
              maxLength={30}
              autoComplete="tel"
              placeholder="07xx xxx xxx"
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </Field>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleNext}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
        >
          Continuă
          <svg
            viewBox="0 0 20 20"
            fill="currentColor"
            className="h-4 w-4"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
