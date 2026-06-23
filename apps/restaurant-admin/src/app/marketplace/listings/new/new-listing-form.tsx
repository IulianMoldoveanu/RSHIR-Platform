'use client';

// B2B Marketplace — new listing form (client component).
//
// Uses useFormState to surface server-action errors inline without a redirect
// dance. On success the action returns { ok: true, data: { listingId } } and
// the form router-pushes to the detail page so the vendor lands on offers
// immediately.

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { CityRow } from '@/lib/cities';
import { createListingAction } from '../../actions';
import {
  Card,
  Button,
  FormField,
  Icon,
  ErrorState,
  INPUT_CLS,
  SELECT_CLS,
  TEXTAREA_CLS,
} from '@/app/marketplace/_components/ui';

export type TenantOption = { id: string; name: string };

type Props = {
  tenants: TenantOption[];
  cities: CityRow[];
};

export function NewListingForm({ tenants, cities }: Props): JSX.Element {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [windowStart, setWindowStart] = useState('');
  const errorRef = useRef<HTMLDivElement | null>(null);

  async function onSubmit(formData: FormData): Promise<void> {
    setError(null);
    const result = await createListingAction(formData);
    if (!result.ok) {
      setError(result.error);
      // a11y: bring the inline error into view + focus it.
      requestAnimationFrame(() => {
        errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        errorRef.current?.focus();
      });
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
      <Card accent>
        <h2 className="mb-4 flex items-center gap-2 text-sm font-bold text-[#23093a]">
          <Icon name="shield" className="text-[#6b1f8a]" />
          Restaurantul tău
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Restaurant" htmlFor="vendor_tenant_id" required>
            <select
              id="vendor_tenant_id"
              name="vendor_tenant_id"
              required
              defaultValue={tenants[0]?.id ?? ''}
              className={SELECT_CLS}
            >
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Tip business" htmlFor="vertical">
            <select id="vertical" name="vertical" defaultValue="restaurant" className={SELECT_CLS}>
              <option value="restaurant">Restaurant</option>
              <option value="pharmacy">Farmacie</option>
              <option value="retail">Retail</option>
              <option value="other">Altul</option>
            </select>
          </FormField>
          <FormField label="Oraș (opțional)" htmlFor="city_id" colSpan={2}>
            <select id="city_id" name="city_id" defaultValue="" className={SELECT_CLS}>
              <option value="">— selectează —</option>
              {cities.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </FormField>
        </div>
      </Card>

      {/* ── Delivery window ───────────────────────────────────────── */}
      <Card accent>
        <h2 className="mb-4 flex items-center gap-2 text-sm font-bold text-[#23093a]">
          <Icon name="clock" className="text-[#6b1f8a]" />
          Interval livrare
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            label="Început"
            htmlFor="delivery_window_start"
            required
            helper="Momentul în care fereastra de livrare devine activă."
          >
            <input
              id="delivery_window_start"
              name="delivery_window_start"
              type="datetime-local"
              required
              value={windowStart}
              onChange={(e) => setWindowStart(e.target.value)}
              className={INPUT_CLS}
            />
          </FormField>
          <FormField label="Sfârșit" htmlFor="delivery_window_end" required>
            <input
              id="delivery_window_end"
              name="delivery_window_end"
              type="datetime-local"
              required
              min={windowStart || undefined}
              className={INPUT_CLS}
            />
          </FormField>
        </div>
      </Card>

      {/* ── Pickup address ────────────────────────────────────────── */}
      <Card accent>
        <h2 className="mb-4 flex items-center gap-2 text-sm font-bold text-[#23093a]">
          <Icon name="map-pin" className="text-[#6b1f8a]" />
          Adresă ridicare
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField label="Stradă" htmlFor="pickup_street" required colSpan={2}>
            <input
              id="pickup_street"
              name="pickup_street"
              type="text"
              required
              className={INPUT_CLS}
              autoComplete="off"
            />
          </FormField>
          <FormField label="Număr" htmlFor="pickup_number">
            <input
              id="pickup_number"
              name="pickup_number"
              type="text"
              className={INPUT_CLS}
              autoComplete="off"
            />
          </FormField>
          <FormField label="Oraș" htmlFor="pickup_city" colSpan={2}>
            <input
              id="pickup_city"
              name="pickup_city"
              type="text"
              className={INPUT_CLS}
              autoComplete="off"
            />
          </FormField>
          <FormField label="Observații (opțional)" htmlFor="pickup_notes" colSpan={3}>
            <textarea id="pickup_notes" name="pickup_notes" rows={2} className={TEXTAREA_CLS} />
          </FormField>
        </div>
      </Card>

      {/* ── Dropoff address ───────────────────────────────────────── */}
      <Card accent>
        <h2 className="mb-2 flex items-center gap-2 text-sm font-bold text-[#23093a]">
          <Icon name="truck" className="text-[#6b1f8a]" />
          Adresă livrare
        </h2>
        <p className="mb-4 text-xs text-slate-500">
          Nu include datele personale ale clientului (nume, telefon, email). Folosește câmpul
          „Telefon redactat” de mai jos pentru contact.
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField label="Stradă" htmlFor="dropoff_street" required colSpan={2}>
            <input
              id="dropoff_street"
              name="dropoff_street"
              type="text"
              required
              className={INPUT_CLS}
              autoComplete="off"
            />
          </FormField>
          <FormField label="Număr" htmlFor="dropoff_number">
            <input
              id="dropoff_number"
              name="dropoff_number"
              type="text"
              className={INPUT_CLS}
              autoComplete="off"
            />
          </FormField>
          <FormField label="Oraș" htmlFor="dropoff_city" colSpan={2}>
            <input
              id="dropoff_city"
              name="dropoff_city"
              type="text"
              className={INPUT_CLS}
              autoComplete="off"
            />
          </FormField>
          <FormField label="Observații (opțional)" htmlFor="dropoff_notes" colSpan={3}>
            <textarea id="dropoff_notes" name="dropoff_notes" rows={2} className={TEXTAREA_CLS} />
          </FormField>
          <FormField
            label="Telefon client redactat (ex. +407*****89)"
            htmlFor="customer_phone_redacted"
            colSpan={3}
            helper="Folosește un număr mascat — niciodată numărul complet al clientului."
          >
            <input
              id="customer_phone_redacted"
              name="customer_phone_redacted"
              type="text"
              placeholder="+407*****89"
              className={INPUT_CLS}
              autoComplete="off"
            />
          </FormField>
        </div>
      </Card>

      {/* ── Package ───────────────────────────────────────────────── */}
      <Card accent>
        <h2 className="mb-4 flex items-center gap-2 text-sm font-bold text-[#23093a]">
          <Icon name="package" className="text-[#6b1f8a]" />
          Pachet
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField label="Descriere" htmlFor="package_description" required colSpan={3}>
            <textarea
              id="package_description"
              name="package_description"
              rows={3}
              required
              className={TEXTAREA_CLS}
            />
          </FormField>
          <FormField label="Greutate (g)" htmlFor="package_weight_grams" helper="În grame.">
            <input
              id="package_weight_grams"
              name="package_weight_grams"
              type="number"
              min={0}
              max={50000}
              step={1}
              className={INPUT_CLS}
            />
          </FormField>
          <FormField label="Temperatură" htmlFor="package_temperature">
            <select
              id="package_temperature"
              name="package_temperature"
              defaultValue=""
              className={SELECT_CLS}
            >
              <option value="">— oricare —</option>
              <option value="ambient">Ambient</option>
              <option value="chilled">Refrigerat</option>
              <option value="frozen">Congelat</option>
            </select>
          </FormField>
        </div>
      </Card>

      {error ? (
        <div ref={errorRef} tabIndex={-1} aria-live="polite">
          <ErrorState title="Cererea nu a putut fi publicată" description={error} />
        </div>
      ) : null}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="secondary"
          onClick={() => router.push('/marketplace/listings')}
          disabled={isPending}
        >
          Renunță
        </Button>
        <Button type="submit" variant="primary" disabled={isPending}>
          {isPending ? 'Se publică…' : 'Publică cererea'}
        </Button>
      </div>
    </form>
  );
}
