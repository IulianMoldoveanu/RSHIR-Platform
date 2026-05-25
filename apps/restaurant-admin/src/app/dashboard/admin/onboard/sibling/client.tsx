'use client';

import { useMemo, useState, useTransition } from 'react';
import { AlertTriangle, CheckCircle2, ExternalLink, X } from 'lucide-react';
import { createSiblingLocationAction } from './actions';

export type RootTenantOption = {
  id: string;
  name: string;
  slug: string;
  cityId: string | null;
};

export type CityOption = {
  id: string;
  name: string;
};

type SuccessState = {
  newTenantId: string;
  newTenantName: string;
  newTenantSlug: string;
  clonedCategories: number;
  clonedItems: number;
  clonedModifiers: number;
  ownersAdded: number;
};

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function SiblingOnboardClient({
  roots,
  cities,
}: {
  roots: RootTenantOption[];
  cities: CityOption[];
}) {
  const [rootQuery, setRootQuery] = useState('');
  const [selectedRootId, setSelectedRootId] = useState('');
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugManual, setSlugManual] = useState(false);
  const [cityId, setCityId] = useState('');
  const [cloneMenu, setCloneMenu] = useState(true);
  const [cloneBranding, setCloneBranding] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SuccessState | null>(null);
  const [pending, startTransition] = useTransition();

  const selectedRoot = roots.find((r) => r.id === selectedRootId);

  const filtered = useMemo(() => {
    const q = rootQuery.trim().toLowerCase();
    if (!q) return roots.slice(0, 50);
    return roots
      .filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.slug.toLowerCase().includes(q) ||
          r.id.toLowerCase().includes(q),
      )
      .slice(0, 50);
  }, [roots, rootQuery]);

  const onNameChange = (v: string) => {
    setName(v);
    if (!slugManual) setSlug(slugify(v));
  };

  const submit = () => {
    setError(null);
    if (!selectedRootId) {
      setError('Selectează brand-ul root.');
      return;
    }
    if (name.trim().length < 2) {
      setError('Numele locației noi trebuie să aibă cel puțin 2 caractere.');
      return;
    }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      setError('Slug invalid: doar litere mici, cifre și liniuțe (ex: pizza-bun-brasov).');
      return;
    }

    startTransition(async () => {
      const res = await createSiblingLocationAction({
        rootTenantId: selectedRootId,
        name: name.trim(),
        slug: slug.trim(),
        cityId: cityId || null,
        cloneMenu,
        cloneBranding,
      });
      if (res.ok) {
        setResult({
          newTenantId: res.newTenantId,
          newTenantName: res.newTenantName,
          newTenantSlug: res.newTenantSlug,
          clonedCategories: res.clonedCategories,
          clonedItems: res.clonedItems,
          clonedModifiers: res.clonedModifiers,
          ownersAdded: res.ownersAdded,
        });
      } else {
        setError(res.error);
      }
    });
  };

  if (result) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 h-5 w-5 flex-none text-emerald-600" aria-hidden />
          <div className="flex-1">
            <h2 className="text-base font-semibold text-emerald-900">
              Locație nouă creată: {result.newTenantName}
            </h2>
            <p className="mt-1 text-sm text-emerald-800">
              Tenant{' '}
              <code className="rounded bg-white/60 px-1 font-mono text-xs">
                {result.newTenantSlug}
              </code>{' '}
              este acum legat de brand-ul root prin{' '}
              <code className="rounded bg-white/60 px-1 font-mono text-xs">
                parent_brand_id
              </code>
              . OWNER-ii brand-ului au fost adăugați automat.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setResult(null);
              setName('');
              setSlug('');
              setSlugManual(false);
              setCityId('');
            }}
            className="rounded-md p-1 text-emerald-700 hover:bg-emerald-100"
            aria-label="Închide"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <dl className="mt-5 grid gap-3 sm:grid-cols-4">
          <Stat label="Categorii clonate" value={result.clonedCategories} />
          <Stat label="Produse clonate" value={result.clonedItems} />
          <Stat label="Modificatori clonați" value={result.clonedModifiers} />
          <Stat label="Owners adăugați" value={result.ownersAdded} />
        </dl>

        <div className="mt-5 flex flex-wrap gap-3">
          <a
            href={`/dashboard/admin/tenants?focus=${result.newTenantId}`}
            className="inline-flex items-center gap-1 rounded-md bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-700"
          >
            Vezi în lista tenants
            <ExternalLink className="h-3 w-3" aria-hidden />
          </a>
          <button
            type="button"
            onClick={() => {
              setResult(null);
              setName('');
              setSlug('');
              setSlugManual(false);
              setCityId('');
            }}
            className="rounded-md border border-emerald-200 bg-white px-3 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-100"
          >
            Adaugă încă o locație la același brand
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {error && (
        <div className="flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" aria-hidden />
          <span>{error}</span>
        </div>
      )}

      <div className="rounded-2xl border border-zinc-200 bg-white p-5">
        <label className="block">
          <div className="text-sm font-semibold text-zinc-900">1. Selectează brand-ul root</div>
          <div className="mt-0.5 text-xs text-zinc-500">
            Doar tenanți ROOT (parent_brand_id IS NULL). Cauți după nume, slug sau ID.
          </div>
          <input
            type="text"
            value={rootQuery}
            onChange={(e) => setRootQuery(e.target.value)}
            placeholder="ex: foisorul-a"
            className="mt-3 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
          />
        </label>

        {filtered.length === 0 ? (
          <p className="mt-3 text-xs text-zinc-500">Niciun rezultat.</p>
        ) : (
          <ul className="mt-3 max-h-56 divide-y divide-zinc-100 overflow-y-auto rounded-md border border-zinc-200">
            {filtered.map((r) => {
              const sel = selectedRootId === r.id;
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedRootId(r.id)}
                    className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors ${
                      sel ? 'bg-violet-50' : 'hover:bg-zinc-50'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium text-zinc-900">{r.name}</div>
                      <div className="truncate font-mono text-[11px] text-zinc-500">
                        {r.slug} · {r.id.slice(0, 8)}
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {selectedRoot && (
          <p className="mt-3 text-xs text-violet-700">
            Selectat: <span className="font-medium">{selectedRoot.name}</span>
          </p>
        )}
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-5 space-y-4">
        <div className="text-sm font-semibold text-zinc-900">2. Detalii locație nouă</div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs font-medium text-zinc-700">Nume locație</span>
            <input
              type="text"
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              maxLength={200}
              placeholder="ex: Pizza Bun — Brașov Centru"
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-zinc-700">Slug (URL)</span>
            <input
              type="text"
              value={slug}
              onChange={(e) => {
                setSlug(e.target.value);
                setSlugManual(true);
              }}
              placeholder="pizza-bun-brasov-centru"
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 font-mono text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
            />
            <span className="mt-1 block text-[10px] text-zinc-500">
              Auto-generat din nume. Editează dacă vrei alt URL.
            </span>
          </label>
          <label className="block sm:col-span-2">
            <span className="text-xs font-medium text-zinc-700">Oraș</span>
            <select
              value={cityId}
              onChange={(e) => setCityId(e.target.value)}
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
            >
              <option value="">— Fără oraș setat —</option>
              {cities.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-5">
        <div className="text-sm font-semibold text-zinc-900">3. Ce moștenește de la root</div>
        <div className="mt-3 space-y-2">
          <label className="flex items-start gap-2 text-sm text-zinc-800">
            <input
              type="checkbox"
              checked={cloneMenu}
              onChange={(e) => setCloneMenu(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              <span className="font-medium">Clonează meniul</span>
              <span className="block text-xs text-zinc-500">
                Copiem toate categoriile, produsele și modificatorii. Le poți edita ulterior independent.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm text-zinc-800">
            <input
              type="checkbox"
              checked={cloneBranding}
              onChange={(e) => setCloneBranding(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              <span className="font-medium">Clonează branding-ul</span>
              <span className="block text-xs text-zinc-500">
                Logo, cover, culori, setări — copiate din tenant-ul root. Pot fi schimbate apoi per locație.
              </span>
            </span>
          </label>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={submit}
          disabled={pending || !selectedRootId || !name || !slug}
          className="inline-flex items-center gap-1.5 rounded-md bg-violet-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-violet-700 disabled:opacity-50"
        >
          {pending ? 'Creez locația…' : 'Creează locația'}
        </button>
        <span className="text-xs text-zinc-500">
          OWNER-ii brand-ului root vor primi acces automat la noua locație.
        </span>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-emerald-200 bg-white px-3 py-2">
      <div className="text-[10px] font-medium uppercase tracking-wider text-emerald-700">
        {label}
      </div>
      <div className="mt-0.5 text-lg font-semibold text-emerald-900">{value}</div>
    </div>
  );
}
