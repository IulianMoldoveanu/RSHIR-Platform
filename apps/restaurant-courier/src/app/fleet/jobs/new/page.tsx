// Stream UI-3 — Rating + Job board (Open Marketplace Extensions).
//
// /fleet/jobs/new — fleet creates a new job listing.
//
// Server action validates + inserts via `createJobListingAction`. The form
// stays uncontrolled (server-rendered defaults + native browser validation)
// so the page works the same on slow networks and mid-flight reloads.

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { requireFleetManager } from '@/lib/fleet-manager';
import { createAdminClientUntyped } from '@/lib/supabase/admin';
import { isJobBoardEnabled } from '@/lib/feature-flags';
import { PageHeader, Card, buttonClass } from '@/app/_marketplace-ui';
import { createJobListingAction } from '../actions';

export const dynamic = 'force-dynamic';

type CityRow = { id: string; name: string; county: string | null };

async function createFormAction(formData: FormData): Promise<void> {
  'use server';
  const result = await createJobListingAction(formData);
  if (!result.ok) {
    // Encode the field values in the redirect so the user doesn't lose
    // their work — keep it short to fit in the query string. For long
    // form fields (description/requirements) we just surface the error.
    redirect(`/fleet/jobs/new?error=${encodeURIComponent(result.error)}`);
  }
  redirect(`/fleet/jobs/${result.listingId ?? ''}/applications`);
}

export default async function NewJobListingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (!isJobBoardEnabled()) notFound();

  await requireFleetManager();
  const { error: errorParam } = await searchParams;

  const admin = createAdminClientUntyped();
  const { data: citiesData } = await admin
    .from('cities')
    .select('id, name, county')
    .order('name', { ascending: true });
  const cities = (citiesData ?? []) as CityRow[];

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <Link
        href="/fleet/jobs"
        className="inline-flex items-center gap-1 self-start text-xs font-medium text-hir-muted-fg hover:text-hir-fg"
      >
        <ArrowLeft className="h-3 w-3" strokeWidth={1.75} aria-hidden />
        Înapoi la joburi
      </Link>

      <PageHeader
        variant="hero"
        eyebrow="MARKETPLACE FLOTĂ"
        title="Postare nouă"
        description="Anunțul va apărea pe board-ul curierilor după ce îl publici."
      />

      {errorParam ? (
        <div
          role="alert"
          aria-live="polite"
          className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-200"
        >
          {errorParam}
        </div>
      ) : null}

      <Card>
      <form action={createFormAction} className="flex flex-col gap-4">
        <Field
          label="Titlu post"
          name="position_title"
          required
          maxLength={200}
          placeholder="ex: Curier scuter zona Floreasca"
        />

        <Field
          label="Tip contract"
          name="employment_type"
          required
          type="select"
          options={[
            { value: '', label: 'Alege…' },
            { value: 'PFA', label: 'PFA' },
            { value: 'salariat', label: 'Salariat (CIM)' },
            { value: 'contractor', label: 'Contractor' },
          ]}
        />

        <Field
          label="Oraș"
          name="city_id"
          type="select"
          options={[
            { value: '', label: 'Toate orașele' },
            ...cities.map((c) => ({
              value: c.id,
              label: c.county ? `${c.name}, ${c.county}` : c.name,
            })),
          ]}
        />

        <Field
          label="Descriere"
          name="description"
          required
          type="textarea"
          rows={5}
          maxLength={5000}
          placeholder="Descrie postul, programul, mediul de lucru."
        />

        <Field
          label="Cerințe (opțional)"
          name="requirements"
          type="textarea"
          rows={4}
          maxLength={5000}
          placeholder="Permis, vechime, vehicul propriu, alte cerințe."
        />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field
            label="Salariu minim (RON)"
            name="salary_range_min_ron"
            type="number"
            min={0}
            max={1000000}
            placeholder="ex: 2500"
          />
          <Field
            label="Salariu maxim (RON)"
            name="salary_range_max_ron"
            type="number"
            min={0}
            max={1000000}
            placeholder="ex: 4500"
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field
            label="Program (opțional)"
            name="shift_pattern"
            maxLength={200}
            placeholder="ex: 8h/zi, 5 zile/săpt."
          />
          <Field
            label="Vehicul cerut (opțional)"
            name="vehicle_required"
            maxLength={200}
            placeholder="ex: scuter / bicicletă / propriu"
          />
        </div>

        <Field
          label="Limbi cerute (opțional)"
          name="languages_required"
          maxLength={100}
          placeholder="ex: ro, en, hu (separate prin virgulă)"
        />

        <Field
          label="Expiră la (opțional)"
          name="expires_at"
          type="datetime-local"
          hint="Lasă gol pentru 30 de zile implicit."
        />

        <div className="flex items-center gap-2 pt-2">
          <button type="submit" className={buttonClass('primary', 'md')}>
            Publică
          </button>
          <Link href="/fleet/jobs" className={buttonClass('secondary', 'md')}>
            Anulează
          </Link>
        </div>
      </form>
      </Card>
    </div>
  );
}

type FieldOption = { value: string; label: string };

function Field({
  label,
  name,
  required = false,
  type = 'text',
  options,
  rows,
  maxLength,
  min,
  max,
  placeholder,
  hint,
}: {
  label: string;
  name: string;
  required?: boolean;
  type?: 'text' | 'number' | 'textarea' | 'select' | 'datetime-local';
  options?: FieldOption[];
  rows?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  placeholder?: string;
  hint?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-hir-muted-fg">
        {label}
        {required ? <span className="ml-0.5 text-rose-300">*</span> : null}
      </span>
      {type === 'textarea' ? (
        <textarea
          name={name}
          required={required}
          rows={rows ?? 4}
          maxLength={maxLength}
          placeholder={placeholder}
          className="rounded-md border border-hir-border bg-hir-bg p-2 text-sm text-hir-fg placeholder:text-hir-muted-fg/60"
        />
      ) : type === 'select' && options ? (
        <select
          name={name}
          required={required}
          defaultValue=""
          className="rounded-md border border-hir-border bg-hir-bg p-2 text-sm text-hir-fg"
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          type={type}
          name={name}
          required={required}
          maxLength={maxLength}
          min={min}
          max={max}
          placeholder={placeholder}
          className="rounded-md border border-hir-border bg-hir-bg p-2 text-sm text-hir-fg placeholder:text-hir-muted-fg/60"
        />
      )}
      {hint ? <span className="text-[10px] text-hir-muted-fg">{hint}</span> : null}
    </label>
  );
}
