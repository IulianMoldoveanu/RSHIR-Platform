'use client';

// B2B Marketplace — new listing form (client component).
//
// Uses useFormState to surface server-action errors inline without a redirect
// dance. On success the action returns { ok: true, data: { listingId } } and
// the form router-pushes to the detail page so the vendor lands on offers
// immediately.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { CityRow } from '@/lib/cities';
import { createListingAction } from '../../actions';

export type TenantOption = { id: string; name: string };

type Props = {
  tenants: TenantOption[];
  cities: CityRow[];
};

const INPUT_CLS =
  'block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm transition focus:border-purple-600 focus:outline-none focus:ring-1 focus:ring-purple-600';
const LABEL_CLS = 'block text-xs font-medium uppercase tracking-wide text-zinc-500';

export function NewListingForm({ tenants, cities }: Props): JSX.Element {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function onSubmit(formData: FormData): Promise<void> {
    setError(null);
    const result = await createListingAction(formData);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.push(`/marketplace/listings/${result.data.listingId}`);
    router.refresh();
  }

  return (
    <form
      action={(formData) => startTransition(() => void onSubmit(formData))}
      className="mt-6 flex flex-col gap-6"
    >
      {/* ── Tenant + vertical ─────────────────────────────────────── */}
      <section className="rounded-lg border border-zinc-200 bg-white p-5">
        <h2 className="mb-4 text-sm font-semibold text-zinc-900">Restaurantul tău</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label htmlFor="vendor_tenant_id" className={LABEL_CLS}>
              Restaurant
            </label>
            <select
              id="vendor_tenant_id"
              name="vendor_tenant_id"
              required
              defaultValue={tenants[0]?.id ?? ''}
              className={`${INPUT_CLS} mt-1`}
            >
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="vertical" className={LABEL_CLS}>
              Tip business
            </label>
            <select
              id="vertical"
              name="vertical"
              defaultValue="restaurant"
              className={`${INPUT_CLS} mt-1`}
            >
              <option value="restaurant">Restaurant</option>
              <option value="pharmacy">Farmacie</option>
              <option value="retail">Retail</option>
              <option value="other">Altul</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <label htmlFor="city_id" className={LABEL_CLS}>
              Oraș (opțional)
            </label>
            <select id="city_id" name="city_id" defaultValue="" className={`${INPUT_CLS} mt-1`}>
              <option value="">— selectează —</option>
              {cities.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {/* ── Delivery window ───────────────────────────────────────── */}
      <section className="rounded-lg border border-zinc-200 bg-white p-5">
        <h2 className="mb-4 text-sm font-semibold text-zinc-900">Interval livrare</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label htmlFor="delivery_window_start" className={LABEL_CLS}>
              Început
            </label>
            <input
              id="delivery_window_start"
              name="delivery_window_start"
              type="datetime-local"
              required
              className={`${INPUT_CLS} mt-1`}
            />
          </div>
          <div>
            <label htmlFor="delivery_window_end" className={LABEL_CLS}>
              Sfârșit
            </label>
            <input
              id="delivery_window_end"
              name="delivery_window_end"
              type="datetime-local"
              required
              className={`${INPUT_CLS} mt-1`}
            />
          </div>
        </div>
      </section>

      {/* ── Pickup address ────────────────────────────────────────── */}
      <section className="rounded-lg border border-zinc-200 bg-white p-5">
        <h2 className="mb-4 text-sm font-semibold text-zinc-900">Adresă ridicare</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="md:col-span-2">
            <label htmlFor="pickup_street" className={LABEL_CLS}>
              Stradă
            </label>
            <input
              id="pickup_street"
              name="pickup_street"
              type="text"
              required
              className={`${INPUT_CLS} mt-1`}
              autoComplete="off"
            />
          </div>
          <div>
            <label htmlFor="pickup_number" className={LABEL_CLS}>
              Număr
            </label>
            <input
              id="pickup_number"
              name="pickup_number"
              type="text"
              className={`${INPUT_CLS} mt-1`}
              autoComplete="off"
            />
          </div>
          <div className="md:col-span-2">
            <label htmlFor="pickup_city" className={LABEL_CLS}>
              Oraș
            </label>
            <input
              id="pickup_city"
              name="pickup_city"
              type="text"
              className={`${INPUT_CLS} mt-1`}
              autoComplete="off"
            />
          </div>
          <div className="md:col-span-3">
            <label htmlFor="pickup_notes" className={LABEL_CLS}>
              Observații (opțional)
            </label>
            <textarea
              id="pickup_notes"
              name="pickup_notes"
              rows={2}
              className={`${INPUT_CLS} mt-1`}
            />
          </div>
        </div>
      </section>

      {/* ── Dropoff address ───────────────────────────────────────── */}
      <section className="rounded-lg border border-zinc-200 bg-white p-5">
        <h2 className="mb-2 text-sm font-semibold text-zinc-900">Adresă livrare</h2>
        <p className="mb-4 text-xs text-zinc-500">
          Nu include datele personale ale clientului (nume, telefon, email). Folosește câmpul
          „Telefon redactat” de mai jos pentru contact.
        </p>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="md:col-span-2">
            <label htmlFor="dropoff_street" className={LABEL_CLS}>
              Stradă
            </label>
            <input
              id="dropoff_street"
              name="dropoff_street"
              type="text"
              required
              className={`${INPUT_CLS} mt-1`}
              autoComplete="off"
            />
          </div>
          <div>
            <label htmlFor="dropoff_number" className={LABEL_CLS}>
              Număr
            </label>
            <input
              id="dropoff_number"
              name="dropoff_number"
              type="text"
              className={`${INPUT_CLS} mt-1`}
              autoComplete="off"
            />
          </div>
          <div className="md:col-span-2">
            <label htmlFor="dropoff_city" className={LABEL_CLS}>
              Oraș
            </label>
            <input
              id="dropoff_city"
              name="dropoff_city"
              type="text"
              className={`${INPUT_CLS} mt-1`}
              autoComplete="off"
            />
          </div>
          <div className="md:col-span-3">
            <label htmlFor="dropoff_notes" className={LABEL_CLS}>
              Observații (opțional)
            </label>
            <textarea
              id="dropoff_notes"
              name="dropoff_notes"
              rows={2}
              className={`${INPUT_CLS} mt-1`}
            />
          </div>
          <div className="md:col-span-3">
            <label htmlFor="customer_phone_redacted" className={LABEL_CLS}>
              Telefon client redactat (ex. +407*****89)
            </label>
            <input
              id="customer_phone_redacted"
              name="customer_phone_redacted"
              type="text"
              placeholder="+407*****89"
              className={`${INPUT_CLS} mt-1`}
              autoComplete="off"
            />
          </div>
        </div>
      </section>

      {/* ── Package ───────────────────────────────────────────────── */}
      <section className="rounded-lg border border-zinc-200 bg-white p-5">
        <h2 className="mb-4 text-sm font-semibold text-zinc-900">Pachet</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="md:col-span-3">
            <label htmlFor="package_description" className={LABEL_CLS}>
              Descriere
            </label>
            <textarea
              id="package_description"
              name="package_description"
              rows={3}
              required
              className={`${INPUT_CLS} mt-1`}
            />
          </div>
          <div>
            <label htmlFor="package_weight_grams" className={LABEL_CLS}>
              Greutate (g)
            </label>
            <input
              id="package_weight_grams"
              name="package_weight_grams"
              type="number"
              min={0}
              max={50000}
              step={1}
              className={`${INPUT_CLS} mt-1`}
            />
          </div>
          <div>
            <label htmlFor="package_temperature" className={LABEL_CLS}>
              Temperatură
            </label>
            <select
              id="package_temperature"
              name="package_temperature"
              defaultValue=""
              className={`${INPUT_CLS} mt-1`}
            >
              <option value="">— oricare —</option>
              <option value="ambient">Ambient</option>
              <option value="chilled">Refrigerat</option>
              <option value="frozen">Congelat</option>
            </select>
          </div>
        </div>
      </section>

      {error ? (
        <div
          role="alert"
          className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
        >
          {error}
        </div>
      ) : null}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={() => router.push('/marketplace/listings')}
          className="inline-flex items-center justify-center rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 shadow-sm transition hover:bg-zinc-50"
          disabled={isPending}
        >
          Renunță
        </button>
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex items-center justify-center rounded-md bg-purple-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? 'Se publică…' : 'Publică cererea'}
        </button>
      </div>
    </form>
  );
}
