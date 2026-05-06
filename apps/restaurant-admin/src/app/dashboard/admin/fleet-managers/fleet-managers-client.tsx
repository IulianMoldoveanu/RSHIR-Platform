'use client';

import { useState, useTransition } from 'react';
import {
  addFleetManagerMembership,
  removeFleetManagerMembership,
  setExternalDispatchConfig,
} from './actions';

type TenantRow = {
  id: string;
  slug: string;
  name: string;
  citySlug: string | null;
  cityName: string | null;
  external_dispatch_webhook_url: string | null;
  external_dispatch_enabled: boolean;
  has_secret: boolean;
};

type FleetManagerRow = {
  user_id: string;
  email: string;
  tenants: { id: string; name: string; slug: string }[];
};

type CityOption = { slug: string; name: string };

export function FleetManagersClient({
  tenants,
  fleetManagers,
  cities,
}: {
  tenants: TenantRow[];
  fleetManagers: FleetManagerRow[];
  cities: CityOption[];
}) {
  return (
    <div className="flex flex-col gap-8">
      <FleetManagerAssignSection
        tenants={tenants}
        fleetManagers={fleetManagers}
        cities={cities}
      />
      <ExternalDispatchSection tenants={tenants} />
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Section 1: assign FM to tenants
// ────────────────────────────────────────────────────────────

function FleetManagerAssignSection({
  tenants,
  fleetManagers,
  cities,
}: {
  tenants: TenantRow[];
  fleetManagers: FleetManagerRow[];
  cities: CityOption[];
}) {
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<
    { kind: 'ok'; msg: string } | { kind: 'err'; msg: string } | null
  >(null);
  // Lane MULTI-CITY: per-city filter so Iulian can answer "câți FM-i avem
  // în Brașov?" without scrolling. Filter is on the FM list (an FM matches
  // if any of his tenants is in the selected city) — affects only the
  // displayed list, not the assign form (which keeps full tenant choices).
  const [cityFilter, setCityFilter] = useState<string>('');
  const tenantSlugById = new Map(tenants.map((t) => [t.id, t.citySlug]));
  const filteredFms = cityFilter
    ? fleetManagers.filter((fm) =>
        fm.tenants.some((t) => tenantSlugById.get(t.id) === cityFilter),
      )
    : fleetManagers;

  function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFeedback(null);
    const fd = new FormData(e.currentTarget);
    const email = (fd.get('email') as string).trim();
    const tenant_id = (fd.get('tenant_id') as string).trim();
    if (!email || !tenant_id) {
      setFeedback({ kind: 'err', msg: 'Alegeți email + restaurant.' });
      return;
    }
    startTransition(async () => {
      const res = await addFleetManagerMembership({ email, tenant_id });
      if (!res.ok) setFeedback({ kind: 'err', msg: res.error });
      else {
        setFeedback({ kind: 'ok', msg: `Adăugat ${email} la restaurant.` });
        (e.target as HTMLFormElement).reset();
      }
    });
  }

  function handleRemove(user_id: string, tenant_id: string, email: string, tenantName: string) {
    if (
      !confirm(
        `Eliminați rolul FLEET_MANAGER pentru ${email} de la ${tenantName}?`,
      )
    ) {
      return;
    }
    setFeedback(null);
    startTransition(async () => {
      const res = await removeFleetManagerMembership({ user_id, tenant_id });
      if (!res.ok) setFeedback({ kind: 'err', msg: res.error });
      else setFeedback({ kind: 'ok', msg: 'Apartenență eliminată.' });
    });
  }

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-5">
      <h2 className="text-base font-semibold text-zinc-900">
        Asociere fleet manager — restaurant
      </h2>
      <p className="mt-1 text-sm text-zinc-600">
        Email-ul trebuie să corespundă unui cont Supabase deja existent.
        Pentru un manager nou, trimiteți întâi un invite.
      </p>

      <form
        onSubmit={handleAdd}
        className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto]"
      >
        <input
          name="email"
          type="email"
          placeholder="Email manager"
          required
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
        />
        <select
          name="tenant_id"
          required
          defaultValue=""
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
        >
          <option value="" disabled>
            Alegeți restaurantul
          </option>
          {tenants.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} ({t.slug})
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:bg-zinc-400"
        >
          {pending ? 'Se salvează…' : 'Asociază'}
        </button>
      </form>

      {feedback && (
        <div
          className={`mt-3 rounded-md px-3 py-2 text-sm ${
            feedback.kind === 'ok'
              ? 'border border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border border-rose-200 bg-rose-50 text-rose-800'
          }`}
        >
          {feedback.msg}
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-end justify-between gap-3">
        <h3 className="text-sm font-semibold text-zinc-900">
          Manageri asociați ({filteredFms.length}
          {cityFilter ? ` din ${fleetManagers.length}` : ''})
        </h3>
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium text-zinc-700">Filtrează după oraș</span>
          <select
            value={cityFilter}
            onChange={(e) => setCityFilter(e.target.value)}
            className="min-w-[180px] rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
          >
            <option value="">Toate orașele</option>
            {cities.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {filteredFms.length === 0 ? (
        <p className="mt-2 text-sm text-zinc-500">
          {fleetManagers.length === 0
            ? 'Niciun fleet manager configurat încă.'
            : 'Niciun fleet manager în orașul selectat.'}
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-3">
          {filteredFms.map((fm) => (
            <li
              key={fm.user_id}
              className="rounded-md border border-zinc-200 bg-zinc-50 p-3"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-zinc-900">
                  {fm.email}
                </span>
                <span className="text-xs text-zinc-500">
                  {fm.tenants.length} restaurant
                  {fm.tenants.length === 1 ? '' : 'e'}
                </span>
              </div>
              <ul className="mt-2 flex flex-wrap gap-2">
                {fm.tenants.map((t) => (
                  <li
                    key={t.id}
                    className="inline-flex items-center gap-2 rounded-full border border-zinc-300 bg-white px-2 py-0.5 text-xs text-zinc-700"
                  >
                    {t.name}
                    <button
                      type="button"
                      onClick={() =>
                        handleRemove(fm.user_id, t.id, fm.email, t.name)
                      }
                      className="text-rose-600 hover:text-rose-800"
                      title="Elimină asocierea"
                      aria-label={`Elimină ${fm.email} de la ${t.name}`}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ────────────────────────────────────────────────────────────
// Section 2: per-tenant external dispatch config
// ────────────────────────────────────────────────────────────

function ExternalDispatchSection({ tenants }: { tenants: TenantRow[] }) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-5">
      <h2 className="text-base font-semibold text-zinc-900">
        Dispatch extern (per restaurant)
      </h2>
      <p className="mt-1 text-sm text-zinc-600">
        Când este activ, comenzile trecute în statutul <code>DISPATCHED</code>{' '}
        sunt trimise către URL-ul specificat în loc să fie preluate de
        aplicația HIR pentru curieri. Fiecare cerere este semnată
        HMAC-SHA256 cu secretul de mai jos.
      </p>

      <ul className="mt-4 flex flex-col gap-3">
        {tenants.map((t) => (
          <ExternalDispatchTenantRow key={t.id} tenant={t} />
        ))}
      </ul>
    </section>
  );
}

function ExternalDispatchTenantRow({ tenant }: { tenant: TenantRow }) {
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<
    | { kind: 'ok'; msg: string; preview?: string }
    | { kind: 'err'; msg: string }
    | null
  >(null);
  const [url, setUrl] = useState(tenant.external_dispatch_webhook_url ?? '');
  const [enabled, setEnabled] = useState(tenant.external_dispatch_enabled);
  const [rotate, setRotate] = useState(false);

  function submit() {
    setFeedback(null);
    startTransition(async () => {
      const res = await setExternalDispatchConfig({
        tenant_id: tenant.id,
        webhook_url: url.trim() === '' ? null : url.trim(),
        rotate_secret: rotate,
        enabled,
      });
      if (!res.ok) setFeedback({ kind: 'err', msg: res.error });
      else {
        setFeedback({
          kind: 'ok',
          msg: 'Configurație salvată.',
          preview: res.new_secret_preview,
        });
        setRotate(false);
      }
    });
  }

  function clearConfig() {
    if (
      !confirm(
        `Goliți configurația de dispatch extern pentru ${tenant.name}? Comenzile vor reveni la dispatch-ul HIR standard.`,
      )
    ) {
      return;
    }
    setFeedback(null);
    startTransition(async () => {
      const res = await setExternalDispatchConfig({
        tenant_id: tenant.id,
        webhook_url: null,
        rotate_secret: false,
        enabled: false,
      });
      if (!res.ok) setFeedback({ kind: 'err', msg: res.error });
      else {
        setFeedback({ kind: 'ok', msg: 'Configurație eliminată.' });
        setUrl('');
        setEnabled(false);
      }
    });
  }

  return (
    <li className="rounded-md border border-zinc-200 bg-zinc-50 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-zinc-900">{tenant.name}</p>
          <p className="text-xs text-zinc-500">slug: {tenant.slug}</p>
        </div>
        <span
          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
            tenant.external_dispatch_enabled
              ? 'bg-purple-100 text-purple-800'
              : 'bg-zinc-200 text-zinc-700'
          }`}
        >
          {tenant.external_dispatch_enabled ? 'Activ' : 'Inactiv'}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://fleet.example.com/hir/dispatch"
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
        />
        <div className="flex items-center gap-3 text-xs text-zinc-700">
          <label className="inline-flex items-center gap-1">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />
            Activ
          </label>
          <label className="inline-flex items-center gap-1">
            <input
              type="checkbox"
              checked={rotate}
              onChange={(e) => setRotate(e.target.checked)}
            />
            Generează secret nou
          </label>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 text-xs text-zinc-500">
        <span>
          Secret:{' '}
          {tenant.has_secret ? (
            <span className="text-emerald-700">configurat</span>
          ) : (
            <span className="text-amber-700">
              lipsă — bifați „Generează secret nou”
            </span>
          )}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={clearConfig}
            disabled={pending}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-50"
          >
            Golește
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={pending}
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800 disabled:bg-zinc-400"
          >
            {pending ? 'Se salvează…' : 'Salvează'}
          </button>
        </div>
      </div>

      {feedback && (
        <div
          className={`mt-3 rounded-md px-3 py-2 text-sm ${
            feedback.kind === 'ok'
              ? 'border border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border border-rose-200 bg-rose-50 text-rose-800'
          }`}
        >
          {feedback.msg}
          {feedback.kind === 'ok' && feedback.preview && (
            <p className="mt-1 font-mono text-xs">
              Secret nou (afișat o singură dată): {feedback.preview}
            </p>
          )}
        </div>
      )}
    </li>
  );
}
