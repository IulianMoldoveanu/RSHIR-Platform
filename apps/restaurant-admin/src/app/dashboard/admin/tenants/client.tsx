'use client';

// Pure presentation. All filtering + sorting is server-side via search params.
// Mobile: card list. Desktop (sm+): table rows.

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useTransition, type ChangeEvent } from 'react';
import { openTenantAsPlatformAdmin, setTenantCity, setTenantStatus } from './actions';

export type StatusFilter = 'all' | 'live' | 'onboarding' | 'suspended';
export type SortKey = 'last_order' | 'name' | 'created';

// Estimated MRR per tenant: orders 7d × 30/7 (project to month) × 2 RON
// (single-tier pricing locked 2026-05-09). Returned as integer RON.
function estimatedMrrRon(orders7d: number): number {
  return Math.round((orders7d * 30 / 7) * 2);
}

export type TenantListRow = {
  id: string;
  slug: string;
  name: string;
  city: string | null;
  cityId?: string | null;
  citySlug?: string | null;
  legacyCityText?: string | null;
  tenantStatus: string;
  isLive: boolean;
  wentLiveAt: string | null;
  fmCount: number;
  orders7d: number;
  lastOrderAt: string | null;
  integrationBadges: string[];
  createdAt: string;
};

export type CityOption = { slug: string; name: string };

function formatDateRO(iso: string | null): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('ro-RO', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return '—';
  }
}

function relativeTimeRO(iso: string | null): string {
  if (!iso) return 'fără comenzi';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return 'în viitor';
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return 'acum câteva secunde';
  if (minutes < 60) return `acum ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `acum ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `acum ${days} z`;
  return formatDateRO(iso);
}

export function TenantsListClient({
  rows,
  totalCount,
  filteredCount,
  capped,
  cities,
  currentCity,
  currentStatus,
  currentSort,
}: {
  rows: TenantListRow[];
  totalCount: number;
  filteredCount: number;
  capped: boolean;
  cities: CityOption[];
  currentCity: string;
  currentStatus: StatusFilter;
  currentSort: SortKey;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  function pushParam(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    if (!value) params.delete(key);
    else params.set(key, value);
    const qs = params.toString();
    startTransition(() => {
      router.push(qs ? `?${qs}` : '?');
    });
  }

  function onCityChange(e: ChangeEvent<HTMLSelectElement>) {
    pushParam('city', e.target.value || null);
  }
  function onStatusChange(e: ChangeEvent<HTMLSelectElement>) {
    const v = e.target.value;
    pushParam('status', v === 'all' ? null : v);
  }
  function onSortChange(e: ChangeEvent<HTMLSelectElement>) {
    const v = e.target.value;
    pushParam('sort', v === 'last_order' ? null : v);
  }
  function onClearFilters() {
    startTransition(() => router.push('?'));
  }

  const hasFilters =
    currentCity !== '' || currentStatus !== 'all' || currentSort !== 'last_order';

  return (
    <div className="flex flex-col gap-4">
      {/* Filters bar */}
      <div className="flex flex-col gap-3 rounded-md border border-zinc-200 bg-white p-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-4">
          <label className="flex flex-col gap-1 text-xs">
            <span className="font-medium text-zinc-700">Oraș</span>
            <select
              value={currentCity}
              onChange={onCityChange}
              disabled={pending || cities.length === 0}
              className="min-w-[180px] rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 disabled:opacity-50"
            >
              <option value="">Toate ({totalCount})</option>
              {cities.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs">
            <span className="font-medium text-zinc-700">Stare</span>
            <select
              value={currentStatus}
              onChange={onStatusChange}
              disabled={pending}
              className="min-w-[140px] rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 disabled:opacity-50"
            >
              <option value="all">Toate</option>
              <option value="live">Doar LIVE</option>
              <option value="onboarding">Doar în configurare</option>
              <option value="suspended">Doar suspendate</option>
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs">
            <span className="font-medium text-zinc-700">Sortare</span>
            <select
              value={currentSort}
              onChange={onSortChange}
              disabled={pending}
              className="min-w-[160px] rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 disabled:opacity-50"
            >
              <option value="last_order">Ultima comandă</option>
              <option value="name">Nume (A → Z)</option>
              <option value="created">Data creării</option>
            </select>
          </label>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs text-zinc-500">
            {filteredCount === totalCount
              ? `${totalCount} restaurante`
              : `${filteredCount} din ${totalCount}`}
          </span>
          {hasFilters && (
            <button
              type="button"
              onClick={onClearFilters}
              disabled={pending}
              className="rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
            >
              Resetează filtrele
            </button>
          )}
        </div>
      </div>

      {/* Empty state */}
      {rows.length === 0 ? (
        <div className="rounded-md border border-dashed border-zinc-300 bg-white px-4 py-10 text-center text-sm text-zinc-600">
          Niciun restaurant nu corespunde filtrelor curente.
        </div>
      ) : (
        <>
          {/* Mobile: cards */}
          <ul className="flex flex-col gap-3 sm:hidden">
            {rows.map((r) => (
              <li
                key={r.id}
                className="rounded-md border border-zinc-200 bg-white p-3 text-sm shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-medium text-zinc-900">{r.name}</div>
                    <div className="truncate text-xs text-zinc-500">/{r.slug}</div>
                  </div>
                  <StatusPill isLive={r.isLive} tenantStatus={r.tenantStatus} />
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-y-2 text-xs">
                  <dt className="text-zinc-500">Oraș</dt>
                  <dd className="text-zinc-900">
                    <CityCell row={r} cities={cities} />
                  </dd>
                  <dt className="text-zinc-500">Fleet managers</dt>
                  <dd className="text-zinc-900">{r.fmCount > 0 ? `${r.fmCount}` : '—'}</dd>
                  <dt className="text-zinc-500">Comenzi 7z</dt>
                  <dd className="text-zinc-900">
                    {r.orders7d > 0 ? `${r.orders7d}` : '0'}
                  </dd>
                  <dt className="text-zinc-500">MRR est.</dt>
                  <dd className="text-zinc-900">
                    {r.orders7d > 0
                      ? `${estimatedMrrRon(r.orders7d).toLocaleString('ro-RO')} RON`
                      : '—'}
                  </dd>
                  <dt className="text-zinc-500">Ultima comandă</dt>
                  <dd className="text-zinc-900">{relativeTimeRO(r.lastOrderAt)}</dd>
                </dl>
                <IntegrationBadges badges={r.integrationBadges} />
                <div className="mt-3 flex items-center justify-between gap-3 border-t border-zinc-100 pt-2 text-xs">
                  <div className="flex items-center gap-3">
                    <OpenTenantButton tenantId={r.id} />
                    <Link
                      href={`/dashboard/admin/fleet-managers`}
                      className="text-zinc-600 hover:underline"
                    >
                      FM
                    </Link>
                  </div>
                  {r.tenantStatus !== 'ONBOARDING' && (
                    <SuspendToggleButton
                      tenantId={r.id}
                      tenantName={r.name}
                      isSuspended={r.tenantStatus === 'SUSPENDED'}
                    />
                  )}
                </div>
              </li>
            ))}
          </ul>

          {/* Desktop: table */}
          <div className="hidden overflow-hidden rounded-md border border-zinc-200 bg-white sm:block">
            <table className="w-full text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Restaurant</th>
                  <th className="px-3 py-2 text-left font-medium">Oraș</th>
                  <th className="px-3 py-2 text-left font-medium">Stare</th>
                  <th className="px-3 py-2 text-left font-medium">FM</th>
                  <th className="px-3 py-2 text-left font-medium">Integrări</th>
                  <th className="px-3 py-2 text-right font-medium">Comenzi 7z</th>
                  <th
                    className="px-3 py-2 text-right font-medium"
                    title="Estimare MRR pe baza comenzilor ultimelor 7 zile × 30/7 × 2 RON/comandă (preț HIR locked 2026-05-09)"
                  >
                    MRR est.
                  </th>
                  <th className="px-3 py-2 text-left font-medium">Ultima comandă</th>
                  <th className="px-3 py-2 text-right font-medium">Acțiuni</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-zinc-50">
                    <td className="px-3 py-2.5 align-top">
                      <div className="font-medium text-zinc-900">{r.name}</div>
                      <div className="text-xs text-zinc-500">/{r.slug}</div>
                    </td>
                    <td className="px-3 py-2.5 align-top text-zinc-700">
                      <CityCell row={r} cities={cities} />
                    </td>
                    <td className="px-3 py-2.5 align-top">
                      <StatusPill isLive={r.isLive} tenantStatus={r.tenantStatus} />
                    </td>
                    <td className="px-3 py-2.5 align-top text-zinc-700">
                      {r.fmCount > 0 ? r.fmCount : <span className="text-zinc-400">—</span>}
                    </td>
                    <td className="px-3 py-2.5 align-top">
                      <IntegrationBadges badges={r.integrationBadges} />
                    </td>
                    <td className="px-3 py-2.5 align-top text-right tabular-nums text-zinc-900">
                      {r.orders7d}
                    </td>
                    <td className="px-3 py-2.5 align-top text-right tabular-nums text-zinc-700">
                      {r.orders7d > 0 ? (
                        <span title="Estimare bazată pe comenzile ultimelor 7 zile">
                          {estimatedMrrRon(r.orders7d).toLocaleString('ro-RO')} RON
                        </span>
                      ) : (
                        <span className="text-zinc-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 align-top text-xs text-zinc-600">
                      {relativeTimeRO(r.lastOrderAt)}
                    </td>
                    <td className="px-3 py-2.5 align-top text-right">
                      <div className="flex flex-col items-end gap-1">
                        <OpenTenantButton tenantId={r.id} />
                        {r.tenantStatus !== 'ONBOARDING' && (
                          <SuspendToggleButton
                            tenantId={r.id}
                            tenantName={r.name}
                            isSuspended={r.tenantStatus === 'SUSPENDED'}
                          />
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <p className="text-xs text-zinc-500">
        Lista include toate restaurantele cu vertical RESTAURANT.{' '}
        {capped
          ? 'Afișăm primele 50 după filtrele curente — restrângeți filtrele pentru a vedea mai multe.'
          : 'Comenzile sunt din ultimele 7 zile, exclusiv cele anulate. Coloana „Ultima comandă” acoperă întregul istoric.'}
      </p>
    </div>
  );
}

// Server-action form button: switches the platform admin's TENANT_COOKIE
// to the chosen tenant and redirects to /dashboard. Replaces the previous
// `?tenant=<slug>` link, which had no handler (Codex P2 #3, PR #291).
function OpenTenantButton({ tenantId }: { tenantId: string }) {
  return (
    <form action={openTenantAsPlatformAdmin} className="inline">
      <input type="hidden" name="tenantId" value={tenantId} />
      <button
        type="submit"
        className="text-xs font-medium text-zinc-900 hover:underline"
      >
        Deschide
      </button>
    </form>
  );
}

function StatusPill({ isLive, tenantStatus }: { isLive: boolean; tenantStatus: string }) {
  if (tenantStatus === 'SUSPENDED') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700 ring-1 ring-inset ring-rose-200">
        <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
        Suspendat
      </span>
    );
  }
  if (isLive) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        LIVE
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 ring-1 ring-inset ring-amber-200">
      <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
      În configurare
    </span>
  );
}

// Suspend / reactivate button. Shows a confirm() dialog (RO copy) before
// firing the server action so a slip-of-the-mouse doesn't drop a live tenant.
// Idempotent server-side, so a double-click is harmless.
function SuspendToggleButton({
  tenantId,
  tenantName,
  isSuspended,
}: {
  tenantId: string;
  tenantName: string;
  isSuspended: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onClick() {
    const next = isSuspended ? 'ACTIVE' : 'SUSPENDED';
    const message = isSuspended
      ? `Reactivați restaurantul „${tenantName}"? Storefront-ul va redeveni accesibil clienților.`
      : `Suspendați restaurantul „${tenantName}"? Storefront-ul va deveni inaccesibil pentru clienți, iar comenzile noi vor fi blocate.`;
    if (typeof window !== 'undefined' && !window.confirm(message)) return;
    setError(null);
    startTransition(async () => {
      const res = await setTenantStatus({ tenantId, next });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <span className="inline-flex flex-col items-end gap-0.5">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className={
          isSuspended
            ? 'text-xs font-medium text-emerald-700 hover:underline disabled:opacity-50'
            : 'text-xs font-medium text-rose-700 hover:underline disabled:opacity-50'
        }
        aria-label={isSuspended ? 'Reactivează tenant' : 'Suspendă tenant'}
      >
        {pending ? '…' : isSuspended ? 'Reactivează' : 'Suspendă'}
      </button>
      {error && <span className="text-[10px] text-rose-600">{error}</span>}
    </span>
  );
}

// Lane MULTI-CITY: inline city display + admin "Setează oraș" affordance.
//
// States:
//   - Tenant has cityId set → just show the canonical name.
//   - Tenant has only legacy free-text → show text + small "Setează" button
//     opening an inline dropdown to assign a canonical city_id.
//   - Tenant has neither → show "—" + "Setează oraș" button.
//
// No automated backfill: each transition is a deliberate platform-admin
// action and goes through the audit log via setTenantCity server action.
function CityCell({ row, cities }: { row: TenantListRow; cities: CityOption[] }) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Strip the `legacy:` synthetic slugs from the picker — admins should only
  // assign canonical cities, not perpetuate free-text values.
  const pickable = cities.filter((c) => !c.slug.startsWith('legacy:'));

  function onPick(slug: string) {
    if (!slug) return;
    setError(null);
    startTransition(async () => {
      const res = await setTenantCity({ tenantId: row.id, citySlug: slug });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setEditing(false);
    });
  }

  if (row.cityId && row.city) {
    // Canonical city assigned — read-only display + audit trail covers it.
    return <span>{row.city}</span>;
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-1">
        <select
          autoFocus
          disabled={pending}
          defaultValue=""
          onChange={(e) => onPick(e.target.value)}
          className="rounded border border-zinc-300 bg-white px-1.5 py-1 text-xs"
        >
          <option value="" disabled>Alegeți…</option>
          {pickable.map((c) => (
            <option key={c.slug} value={c.slug}>{c.name}</option>
          ))}
        </select>
        {error && <span className="text-[11px] text-rose-600">{error}</span>}
        <button
          type="button"
          onClick={() => { setEditing(false); setError(null); }}
          disabled={pending}
          className="self-start text-[11px] text-zinc-500 hover:underline"
        >
          Anulează
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0.5">
      <span className={row.legacyCityText ? 'text-zinc-700' : 'text-zinc-400'}>
        {row.legacyCityText ?? '—'}
      </span>
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="self-start text-[11px] font-medium text-indigo-600 hover:underline"
      >
        Setează oraș
      </button>
    </div>
  );
}

function IntegrationBadges({ badges }: { badges: string[] }) {
  if (badges.length === 0) {
    return <span className="text-xs text-zinc-400">—</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {badges.map((b) => (
        <span
          key={b}
          className="inline-flex items-center rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] font-medium text-zinc-700 ring-1 ring-inset ring-zinc-200"
        >
          {b}
        </span>
      ))}
    </div>
  );
}
