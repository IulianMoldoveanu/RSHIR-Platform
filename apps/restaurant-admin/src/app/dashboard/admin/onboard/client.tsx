'use client';

import { useEffect, useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { createTenantWithOwner, switchToTenantAction, type CreateTenantResult } from './actions';

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    // strip diacritics — combining marks U+0300..U+036F
    // eslint-disable-next-line no-misleading-character-class
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30);
}

type SuccessState = Extract<CreateTenantResult, { ok: true }>;

export function OnboardClient({ primaryDomain }: { primaryDomain: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [success, setSuccess] = useState<SuccessState | null>(null);

  // form state
  const [restaurantName, setRestaurantName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);

  // auto-suggest slug from name until edited
  useEffect(() => {
    if (!slugTouched) setSlug(slugify(restaurantName));
  }, [restaurantName, slugTouched]);

  const slugValid = slug.length >= 3 && slug.length <= 30 && SLUG_RE.test(slug);
  const formValid =
    restaurantName.trim().length >= 2 &&
    slugValid &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) &&
    !pending;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!formValid) return;
    startTransition(async () => {
      const r = await createTenantWithOwner({
        restaurantName: restaurantName.trim(),
        slug,
        email: email.trim(),
        phone: phone.trim() || undefined,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setSuccess(r);
    });
  }

  if (success) {
    return <SuccessCard data={success} onReset={() => setSuccess(null)} router={router} />;
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex max-w-2xl flex-col gap-4 rounded-xl border border-zinc-200 bg-white p-6"
    >
      <Field label="Nume restaurant" htmlFor="restaurantName">
        <input
          id="restaurantName"
          type="text"
          value={restaurantName}
          onChange={(e) => setRestaurantName(e.target.value)}
          required
          maxLength={100}
          autoComplete="organization"
          className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          placeholder="ex: Foișorul A"
        />
      </Field>

      <Field
        label="Slug (subdomeniu)"
        htmlFor="slug"
        hint={slug ? `https://${slug}.${primaryDomain}` : `https://<slug>.${primaryDomain}`}
        error={!slug || slugValid ? null : '3-30 caractere, litere mici, cifre, "-"'}
      >
        <input
          id="slug"
          type="text"
          value={slug}
          onChange={(e) => {
            setSlug(e.target.value.toLowerCase());
            setSlugTouched(true);
          }}
          required
          minLength={3}
          maxLength={30}
          pattern="[a-z0-9](?:[a-z0-9-]*[a-z0-9])?"
          className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 font-mono text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          placeholder="foisorul-a"
        />
      </Field>

      <Field label="Email proprietar" htmlFor="email" hint="Va fi folosit pentru login. Se confirmă automat (in-person).">
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="off"
          className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          placeholder="patron@restaurant.ro"
        />
      </Field>

      <Field label="Telefon (opțional)" htmlFor="phone">
        <input
          id="phone"
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          maxLength={30}
          autoComplete="off"
          className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          placeholder="07xx xxx xxx"
        />
      </Field>

      {error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {error}
        </div>
      )}

      <div className="flex items-center justify-end gap-3 pt-2">
        <button
          type="submit"
          disabled={!formValid}
          className="inline-flex items-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-zinc-300"
        >
          {pending ? 'Se creează…' : 'Creează tenant + cont OWNER'}
        </button>
      </div>

      <p className="text-xs text-zinc-500">
        Adăugăm și emailul tău ca <strong>OWNER</strong> al noului tenant ca să
        poți continua onboarding-ul (import meniu, branding, activare comenzi)
        din această sesiune. Îl poți elimina apoi din <em>Configurare → Echipă</em>.
      </p>
    </form>
  );
}

function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium text-zinc-700">
        {label}
      </label>
      {children}
      {error ? (
        <span className="text-xs text-rose-600">{error}</span>
      ) : hint ? (
        <span className="text-xs text-zinc-500">{hint}</span>
      ) : null}
    </div>
  );
}

function SuccessCard({
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
    <div className="flex max-w-2xl flex-col gap-5 rounded-xl border border-emerald-200 bg-emerald-50 p-6">
      <div>
        <div className="text-xs font-medium uppercase tracking-wide text-emerald-700">
          Tenant creat
        </div>
        <h2 className="mt-1 text-lg font-semibold text-emerald-900">
          Bun venit, {data.slug}.
        </h2>
        <p className="mt-1 text-sm text-emerald-800">
          Userul OWNER există, slug-ul e rezervat, tarifa de livrare implicită
          (0–15 km, 15 RON) e setată. Acum: 1) import meniu 2) branding 3)
          activează comenzi.
        </p>
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-emerald-300 bg-white p-4">
        <Row label="URL storefront" mono value={data.storefrontUrl}>
          <CopyButton
            ariaLabel="Copiază URL"
            copied={copiedKey === 'url'}
            onClick={() => copy(data.storefrontUrl, 'url')}
          />
          <a
            href={data.storefrontUrl}
            target="_blank"
            rel="noreferrer"
            className="text-xs font-medium text-indigo-600 underline"
          >
            Deschide
          </a>
        </Row>
        <Row label="Parolă temporară OWNER" mono value={data.tempPassword}>
          <CopyButton
            ariaLabel="Copiază parolă"
            copied={copiedKey === 'pwd'}
            onClick={() => copy(data.tempPassword, 'pwd')}
          />
        </Row>
        <p className="text-xs text-zinc-500">
          Dă parola patronului pe loc. O va schimba la prima conectare prin
          fluxul de reset.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-zinc-900">Pașii rămași</h3>
        <NextStep
          n={1}
          title="Import meniu din GloriaFood (Master Key)"
          description="Pune cheia și apasă Importă. ~2 min."
          onClick={() =>
            switchAndGo('/dashboard/onboarding/migrate-from-gloriafood/master-key')
          }
          disabled={switching}
        />
        <NextStep
          n={2}
          title="Identitate vizuală"
          description="Logo, copertă, culoare brand."
          onClick={() => switchAndGo('/dashboard/settings/branding')}
          disabled={switching}
        />
        <NextStep
          n={3}
          title="Zone de livrare"
          description="Trasează zona pe hartă."
          onClick={() => switchAndGo('/dashboard/zones')}
          disabled={switching}
        />
        <NextStep
          n={4}
          title="Program de funcționare"
          description="Orele restaurantului."
          onClick={() => switchAndGo('/dashboard/settings/operations')}
          disabled={switching}
        />
        <NextStep
          n={5}
          title="Activează comenzi (Go Live)"
          description="Pornește primirea comenzilor de pe storefront."
          onClick={() => switchAndGo('/dashboard/onboarding')}
          disabled={switching}
        />
      </div>

      <div className="flex items-center justify-between border-t border-emerald-300 pt-4">
        <button
          type="button"
          onClick={onReset}
          className="text-sm text-zinc-600 underline"
        >
          Onboardează încă unul
        </button>
        <button
          type="button"
          onClick={() => switchAndGo('/dashboard')}
          disabled={switching}
          className="inline-flex items-center rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          {switching ? 'Se comută…' : 'Comută pe acest tenant'}
        </button>
      </div>
    </div>
  );
}

function Row({
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
        <span className={`mt-0.5 truncate text-sm text-zinc-900 ${mono ? 'font-mono' : ''}`}>
          {value}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  );
}

function CopyButton({
  ariaLabel,
  copied,
  onClick,
}: {
  ariaLabel: string;
  copied: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className="inline-flex items-center rounded-md border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
    >
      {copied ? 'Copiat ✓' : 'Copiază'}
    </button>
  );
}

function NextStep({
  n,
  title,
  description,
  onClick,
  disabled,
}: {
  n: number;
  title: string;
  description: string;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-white p-3 text-left hover:border-emerald-400 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
    >
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-semibold text-emerald-700">
        {n}
      </span>
      <span className="flex flex-col">
        <span className="text-sm font-medium text-zinc-900">{title}</span>
        <span className="text-xs text-zinc-600">{description}</span>
      </span>
    </button>
  );
}
