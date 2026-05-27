'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  createTenantWithOwner,
  switchToTenantAction,
  uploadWizardLogo,
  type CreateTenantResult,
  type RestaurantType,
} from './actions';
import { ProgressBar } from './ProgressBar';
import { StepRestaurant } from './StepRestaurant';
import { StepAuth } from './StepAuth';
import { StepBrand } from './StepBrand';
import type { CityRow } from '@/lib/cities';

export type WizardForm = {
  // Step 1
  restaurantName: string;
  slug: string;
  restaurantType: RestaurantType | '';
  cityId: string;
  address: string;
  phone: string;
  // Step 2
  email: string;
  // Step 3
  brandColor: string;
  tagline: string;
  logoFile: File | null;
  logoPreviewUrl: string | null;
};

const EMPTY_FORM: WizardForm = {
  restaurantName: '',
  slug: '',
  restaurantType: '',
  cityId: '',
  address: '',
  phone: '',
  email: '',
  brandColor: '#7c3aed',
  tagline: '',
  logoFile: null,
  logoPreviewUrl: null,
};

type SuccessState = Extract<CreateTenantResult, { ok: true }>;

type Props = {
  primaryDomain: string;
  cities: CityRow[];
};

export function OnboardWizard({ primaryDomain, cities }: Props) {
  const router = useRouter();
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [form, setForm] = useState<WizardForm>(EMPTY_FORM);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState<SuccessState | null>(null);
  const [submitting, startSubmit] = useTransition();

  function patch(update: Partial<WizardForm>) {
    setForm((prev) => ({ ...prev, ...update }));
  }

  async function handleSubmit() {
    setSubmitError(null);
    startSubmit(async () => {
      const result = await createTenantWithOwner({
        restaurantName: form.restaurantName.trim(),
        slug: form.slug.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || undefined,
        restaurantType: form.restaurantType || undefined,
        cityId: form.cityId || undefined,
        address: form.address.trim() || undefined,
        brandColor: form.brandColor || undefined,
        tagline: form.tagline.trim() || undefined,
      });

      if (!result.ok) {
        setSubmitError(result.error);
        return;
      }

      // Upload logo if provided — non-fatal
      if (form.logoFile) {
        const fd = new FormData();
        fd.set('tenantId', result.tenantId);
        fd.set('file', form.logoFile);
        const logoResult = await uploadWizardLogo(fd);
        if (!logoResult.ok) {
          console.warn('[wizard] logo upload non-fatal:', logoResult.error);
        }
      }

      setSuccess(result);
    });
  }

  if (success) {
    return <SuccessView data={success} onReset={() => { setSuccess(null); setForm(EMPTY_FORM); setStep(0); }} router={router} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <ProgressBar current={step} />

      {step === 0 && (
        <StepRestaurant
          form={form}
          onChange={patch}
          onNext={() => setStep(1)}
          cities={cities}
          primaryDomain={primaryDomain}
        />
      )}
      {step === 1 && (
        <StepAuth
          form={form}
          onChange={patch}
          onNext={() => setStep(2)}
          onBack={() => setStep(0)}
        />
      )}
      {step === 2 && (
        <StepBrand
          form={form}
          onChange={patch}
          onBack={() => setStep(1)}
          onSubmit={handleSubmit}
          submitting={submitting}
          error={submitError}
        />
      )}
    </div>
  );
}

// ── Success screen ────────────────────────────────────────────────────────────

function SuccessView({
  data,
  onReset,
  router,
}: {
  data: SuccessState;
  onReset: () => void;
  router: ReturnType<typeof useRouter>;
}) {
  const [copiedKey, setCopiedKey] = useState<'pwd' | 'url' | null>(null);
  const [switching, startSwitch] = useTransition();

  function copy(value: string, key: 'pwd' | 'url') {
    void navigator.clipboard?.writeText(value).then(() => {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1500);
    });
  }

  function switchAndGo(href: string) {
    startSwitch(async () => {
      const fd = new FormData();
      fd.set('tenantId', data.tenantId);
      await switchToTenantAction(fd);
      router.push(href);
    });
  }

  return (
    <div className="flex flex-col gap-5 rounded-xl border border-emerald-200 bg-emerald-50 p-6">
      <div>
        <div className="text-xs font-medium uppercase tracking-wide text-emerald-700">
          Cont creat cu succes
        </div>
        <h2 className="mt-1 text-lg font-semibold text-emerald-900">
          Bun venit, {data.slug}!
        </h2>
        <p className="mt-1 text-sm text-emerald-800">
          Userul OWNER există, slug-ul e rezervat, tariful de livrare implicit
          este setat. Urmează: import meniu, zone livrare, activare comenzi.
        </p>
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-emerald-300 bg-white p-4">
        <CopyRow label="URL storefront" value={data.storefrontUrl} mono>
          <button
            type="button"
            onClick={() => copy(data.storefrontUrl, 'url')}
            aria-label="Copiază URL storefront"
            className="inline-flex items-center rounded-md border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
          >
            {copiedKey === 'url' ? 'Copiat ✓' : 'Copiază'}
          </button>
          <a
            href={data.storefrontUrl}
            target="_blank"
            rel="noreferrer"
            className="text-xs font-medium text-indigo-600 underline"
          >
            Deschide
          </a>
        </CopyRow>
        <CopyRow label="Parolă temporară OWNER" value={data.tempPassword} mono>
          <button
            type="button"
            onClick={() => copy(data.tempPassword, 'pwd')}
            aria-label="Copiază parolă temporară"
            className="inline-flex items-center rounded-md border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
          >
            {copiedKey === 'pwd' ? 'Copiat ✓' : 'Copiază'}
          </button>
        </CopyRow>
        <p className="text-xs text-zinc-500">
          Dă parola patronului pe loc. O va schimba la prima conectare.
        </p>
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-indigo-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-zinc-900">Continuă în asistent</h3>
        <p className="text-xs text-zinc-600">
          Asistentul de onboarding te ghidează pas cu pas: detalii, meniu,
          zone livrare, plăți, activare. Durează ~8 minute.
        </p>
        <button
          type="button"
          onClick={() => switchAndGo('/dashboard/onboarding/wizard')}
          disabled={switching}
          className="inline-flex w-fit items-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-60"
        >
          {switching ? 'Se comută...' : 'Deschide asistentul'}
        </button>
      </div>

      <div className="flex items-center justify-between border-t border-emerald-300 pt-4">
        <button
          type="button"
          onClick={onReset}
          className="text-sm text-zinc-600 underline"
        >
          Onboardează încă un restaurant
        </button>
        <button
          type="button"
          onClick={() => switchAndGo('/dashboard')}
          disabled={switching}
          className="inline-flex items-center rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          {switching ? 'Se comută...' : 'Comută pe tenant'}
        </button>
      </div>
    </div>
  );
}

function CopyRow({
  label,
  value,
  mono,
  children,
}: {
  label: string;
  value: string;
  mono?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          {label}
        </span>
        <span
          className={`mt-0.5 truncate text-sm text-zinc-900 ${mono ? 'font-mono' : ''}`}
        >
          {value}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  );
}
