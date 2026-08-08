'use client';

// Casual vendor signup wizard — 3 steps.
//
//   Step 1: CUI ANAF lookup (server action) → company name + address echo.
//   Step 2: Brand picker (default to ANAF name, editable) + email + phone.
//   Step 3: Subscription tier selector (3 cards) + final confirm.
//
// Mobile-first: each step renders as a single column on small screens; tier
// cards stack on phones, grid on ≥sm. Wizard state lives in this component;
// the only server roundtrips are anafLookupAction + submitCasualSignupAction.

import { useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, Input, Label } from '@hir/ui';
import { Icon, buttonClass } from '@/app/marketplace/_components/ui';
import {
  anafLookupAction,
  submitCasualSignupAction,
  type SubscriptionTier,
} from './actions';

export type SubscriptionPlanOption = {
  tierCode: SubscriptionTier;
  displayName: string;
  description: string;
  monthlyPriceRon: number;
  maxListingsPerMonth: number | null;
  maxOffersPerMonth: number | null;
};

type AnafSnapshot = {
  cui: string;
  name: string;
  address: string | null;
  vatPayer: boolean;
};

type WizardStep = 1 | 2 | 3;

const CUI_RE = /^(RO)?\d{2,10}$/i;

function planFeatureBullets(plan: SubscriptionPlanOption): string[] {
  const bullets: string[] = [];
  bullets.push(
    plan.maxListingsPerMonth === null
      ? 'Listinguri nelimitate / lună'
      : `${plan.maxListingsPerMonth} listinguri / lună`,
  );
  bullets.push(
    plan.maxOffersPerMonth === null
      ? 'Oferte nelimitate / lună'
      : `${plan.maxOffersPerMonth} oferte / lună`,
  );
  if (plan.description) bullets.push(plan.description);
  return bullets;
}

export function CasualSignupForm({
  plans,
  prefillEmail,
}: {
  plans: SubscriptionPlanOption[];
  prefillEmail: string;
}): JSX.Element {
  const router = useRouter();
  const [step, setStep] = useState<WizardStep>(1);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Step 1 state
  const [cui, setCui] = useState('');
  const [anaf, setAnaf] = useState<AnafSnapshot | null>(null);

  // Step 2 state
  const [brandName, setBrandName] = useState('');
  const [email, setEmail] = useState(prefillEmail);
  const [phone, setPhone] = useState('');

  // Step 3 state — default to the cheapest active plan so the form is never
  // submitted with a null selection.
  const defaultTier: SubscriptionTier = plans[0]?.tierCode ?? 'basic';
  const [tier, setTier] = useState<SubscriptionTier>(defaultTier);

  function resetAnaf(): void {
    setAnaf(null);
    setBrandName('');
  }

  function onCuiSubmit(e: FormEvent): void {
    e.preventDefault();
    setError(null);
    if (!CUI_RE.test(cui.trim())) {
      setError('CUI invalid. Format: RO12345678 sau 12345678.');
      return;
    }
    startTransition(async () => {
      const result = await anafLookupAction(cui.trim());
      if (!result.ok) {
        if (result.error === 'not_found') {
          setError('CUI-ul nu a fost găsit la ANAF.');
        } else if (result.error === 'cif_inactive') {
          setError('Firma figurează inactivă/radiată la ANAF.');
        } else if (result.error === 'unauthenticated') {
          setError('Sesiunea a expirat. Reîncarcă pagina.');
        } else {
          setError('Eroare la verificarea ANAF. Reîncearcă peste câteva secunde.');
        }
        return;
      }
      setAnaf({
        cui: result.company.cui,
        name: result.company.name,
        address: result.company.address,
        vatPayer: result.company.vatPayer,
      });
      // Pre-fill brand name with the ANAF "denumire" — user can edit on step 2.
      setBrandName(result.company.name);
      setStep(2);
    });
  }

  function onBrandSubmit(e: FormEvent): void {
    e.preventDefault();
    setError(null);
    if (brandName.trim().length < 2 || brandName.trim().length > 100) {
      setError('Numele brandului trebuie să aibă 2-100 caractere.');
      return;
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      setError('Email invalid.');
      return;
    }
    if (phone.replace(/\D/g, '').length < 9) {
      setError('Telefon invalid (minim 9 cifre).');
      return;
    }
    setStep(3);
  }

  function onFinalSubmit(e: FormEvent): void {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await submitCasualSignupAction({
        cui: cui.trim(),
        brandName: brandName.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.trim(),
        subscriptionTier: tier,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // Successful enrollment → land on the casual dashboard. router.refresh()
      // also invalidates the layout so the new tenant_member row is visible.
      router.push('/casual-dashboard?created=1');
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <StepIndicator step={step} />

      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>1. Verificare CUI</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={onCuiSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="cui">CUI firmă *</Label>
                <Input
                  id="cui"
                  inputMode="numeric"
                  value={cui}
                  onChange={(e) => setCui(e.target.value.trim())}
                  placeholder="RO46864293"
                  maxLength={12}
                  required
                />
                <p className="text-xs text-slate-500">
                  Verificăm CUI-ul la ANAF înainte de a continua. Firmele
                  radiate/inactive nu pot fi înregistrate.
                </p>
              </div>
              {error && (
                <p role="alert" aria-live="polite" className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  <Icon name="info" className="mt-0.5 shrink-0 text-rose-600" />
                  <span>{error}</span>
                </p>
              )}
              <button type="submit" disabled={isPending} className={buttonClass('primary', 'md', 'w-full')}>
                <Icon name="search" />
                {isPending ? 'Verific la ANAF…' : 'Verifică CUI'}
              </button>
            </form>
          </CardContent>
        </Card>
      )}

      {step === 2 && anaf && (
        <Card>
          <CardHeader>
            <CardTitle>2. Date brand + contact</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={onBrandSubmit} className="space-y-4">
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs text-emerald-900">
                <p className="flex items-center gap-1.5 font-semibold">
                  <Icon name="check-circle" className="text-emerald-600" />
                  ANAF: firmă activă
                </p>
                <p className="mt-1 text-slate-700">
                  <span className="font-semibold">{anaf.name}</span>
                  {' · CUI '}{anaf.cui}
                  {anaf.vatPayer ? ' · plătitor TVA' : ''}
                </p>
                {anaf.address && (
                  <p className="text-slate-700">{anaf.address}</p>
                )}
                <button
                  type="button"
                  className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-[#6b1f8a] underline underline-offset-2 hover:text-[#4a1063] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6b1f8a] focus-visible:ring-offset-1"
                  onClick={() => {
                    resetAnaf();
                    setStep(1);
                  }}
                >
                  <Icon name="arrow-left" className="h-3 w-3" />
                  Schimbă CUI
                </button>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="brand">Nume brand (vizibil pe marketplace) *</Label>
                <Input
                  id="brand"
                  value={brandName}
                  onChange={(e) => setBrandName(e.target.value)}
                  placeholder={anaf.name}
                  maxLength={100}
                  required
                />
                <p className="text-xs text-slate-500">
                  Implicit este denumirea ANAF. Poți alege un brand mai scurt
                  (ex: „Bakery 24/7&rdquo;).
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="email">Email contact *</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="phone">Telefon contact *</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+40 743 700 916"
                  autoComplete="tel"
                  required
                />
              </div>

              {error && (
                <p role="alert" aria-live="polite" className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  <Icon name="info" className="mt-0.5 shrink-0 text-rose-600" />
                  <span>{error}</span>
                </p>
              )}

              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
                <button
                  type="button"
                  className={buttonClass('secondary')}
                  onClick={() => setStep(1)}
                  disabled={isPending}
                >
                  <Icon name="arrow-left" />
                  Înapoi
                </button>
                <button type="submit" className={buttonClass('primary')} disabled={isPending}>
                  Continuă la abonament
                  <Icon name="arrow-right" />
                </button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {step === 3 && anaf && (
        <Card>
          <CardHeader>
            <CardTitle>3. Alege planul + confirmă</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={onFinalSubmit} className="space-y-5">
              <p className="text-sm text-slate-600">
                Toate planurile vin cu <strong>30 de zile trial</strong>. Plata
                lunară pornește după trial; poți anula oricând din panou.
              </p>

              <div className="grid gap-3 sm:grid-cols-3">
                {plans.map((plan) => {
                  const selected = plan.tierCode === tier;
                  return (
                    <label
                      key={plan.tierCode}
                      htmlFor={`tier-${plan.tierCode}`}
                      className={
                        'flex cursor-pointer flex-col rounded-2xl border p-4 transition-all duration-200 focus-within:ring-2 focus-within:ring-[#6b1f8a] focus-within:ring-offset-1 ' +
                        (selected
                          ? 'border-[#6b1f8a] bg-[#f7f0fb] ring-2 ring-[#6b1f8a] shadow-[0_6px_24px_rgba(107,31,138,0.12)]'
                          : 'border-slate-200 bg-white hover:-translate-y-0.5 hover:border-[#e9d5f0] hover:shadow-sm')
                      }
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-bold text-[#23093a]">
                            {plan.displayName}
                          </p>
                          <p className="text-2xl font-black tabular-nums text-[#23093a]">
                            {plan.monthlyPriceRon}
                            <span className="text-sm font-normal text-slate-500"> RON / lună</span>
                          </p>
                        </div>
                        <input
                          id={`tier-${plan.tierCode}`}
                          type="radio"
                          name="tier"
                          value={plan.tierCode}
                          checked={selected}
                          onChange={() => setTier(plan.tierCode)}
                          className="mt-1 h-4 w-4 accent-[#6b1f8a]"
                        />
                      </div>
                      <ul className="mt-3 space-y-1 text-xs text-slate-700">
                        {planFeatureBullets(plan).map((b, i) => (
                          <li key={i} className="flex items-start gap-1.5">
                            <Icon name="check-circle" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                            <span>{b}</span>
                          </li>
                        ))}
                      </ul>
                    </label>
                  );
                })}
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-700">
                <p className="flex items-center gap-1.5 font-semibold text-[#23093a]">
                  <Icon name="shield" className="h-3.5 w-3.5 text-[#6b1f8a]" />
                  Confirmi că:
                </p>
                <ul className="mt-1.5 list-disc pl-5">
                  <li>Brand-ul „{brandName.trim()}&rdquo; va fi vizibil public pe marketplace.</li>
                  <li>Contul devine activ după validare manuală (24h lucrătoare).</li>
                  <li>Primești o lună trial; după aceea <span className="tabular-nums">{plans.find((p) => p.tierCode === tier)?.monthlyPriceRon}</span> RON/lună.</li>
                </ul>
              </div>

              {error && (
                <p role="alert" aria-live="polite" className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  <Icon name="info" className="mt-0.5 shrink-0 text-rose-600" />
                  <span>{error}</span>
                </p>
              )}

              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
                <button
                  type="button"
                  className={buttonClass('secondary')}
                  onClick={() => setStep(2)}
                  disabled={isPending}
                >
                  <Icon name="arrow-left" />
                  Înapoi
                </button>
                <button type="submit" className={buttonClass('primary')} disabled={isPending}>
                  <Icon name="check-circle" />
                  {isPending ? 'Se înregistrează…' : 'Finalizează înregistrarea'}
                </button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StepIndicator({ step }: { step: WizardStep }): JSX.Element {
  const labels = ['CUI', 'Date brand', 'Abonament'];
  return (
    <ol className="flex items-center justify-center gap-2 text-xs sm:gap-4">
      {labels.map((label, i) => {
        const n = (i + 1) as WizardStep;
        const active = n === step;
        const done = n < step;
        return (
          <li key={label} className="flex items-center gap-2">
            <span
              className={
                'inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums ' +
                (active
                  ? 'bg-gradient-to-br from-[#6b1f8a] to-[#8e3bb0] text-white shadow-[0_2px_8px_rgba(107,31,138,0.25)]'
                  : done
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-200 text-slate-600')
              }
            >
              {done ? <Icon name="check-circle" className="h-3.5 w-3.5" /> : n}
            </span>
            <span
              className={active || done ? 'font-medium text-[#23093a]' : 'text-slate-500'}
            >
              {label}
            </span>
            {i < labels.length - 1 && (
              <Icon name="arrow-right" className="h-3.5 w-3.5 text-slate-300" />
            )}
          </li>
        );
      })}
    </ol>
  );
}
