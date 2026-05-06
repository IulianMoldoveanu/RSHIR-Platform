'use client';

// Pure presentation. All filtering + sorting is server-side via search params.
// Mobile: card list. Desktop (sm+): table rows.

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTransition, type ChangeEvent } from 'react';

export type StatusFilter = 'all' | 'live' | 'onboarding';
export type SortKey = 'last_order' | 'name' | 'created';

export type TenantListRow = {
  id: string;
  slug: string;
  name: string;
  city: string | null;
  tenantStatus: string;
  isLive: boolean;
  wentLiveAt: string | null;
  fmCount: number;
  orders7d: number;
  lastOrderAt: string | null;
  integrationBadges: string[];
  createdAt: string;
};

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
  cities,
  currentCity,
  currentStatus,
  currentSort,
}: {
  rows: TenantListRow[];
  totalCount: number;
  filteredCount: number;
  cities: string[];
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
              className="min-w-[140px] rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 disabled:opacity-50"
            >
              <option value="">Toate ({totalCount})</option>
              {cities.map((c) => (
                <option key={c} value={c.toLowerCase()}>
                  {c}
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
                  <StatusPill isLive={r.isLive} />
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-y-2 text-xs">
                  <dt className="text-zinc-500">Oraș</dt>
                  <dd className="text-zinc-900">{r.city ?? '—'}</dd>
                  <dt className="text-zinc-500">Fleet managers</dt>
                  <dd className="text-zinc-900">{r.fmCount > 0 ? `${r.fmCount}` : '—'}</dd>
                  <dt className="text-zinc-500">Comenzi 7z</dt>
                  <dd className="text-zinc-900">
                    {r.orders7d > 0 ? `${r.orders7d}` : '0'}
                  </dd>
                  <dt className="text-zinc-500">Ultima comandă</dt>
                  <dd className="text-zinc-900">{relativeTimeRO(r.lastOrderAt)}</dd>
                </dl>
                <IntegrationBadges badges={r.integrationBadges} />
                <div className="mt-3 flex items-center gap-3 border-t border-zinc-100 pt-2 text-xs">
                  <Link
                    href={`/dashboard?tenant=${r.slug}`}
                    className="font-medium text-zinc-900 hover:underline"
                  >
                    Deschide
                  </Link>
                  <Link
                    href={`/dashboard/admin/fleet-managers`}
                    className="text-zinc-600 hover:underline"
                  >
                    FM
                  </Link>
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
                      {r.city ?? <span className="text-zinc-400">—</span>}
                    </td>
                    <td className="px-3 py-2.5 align-top">
                      <StatusPill isLive={r.isLive} />
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
                    <td className="px-3 py-2.5 align-top text-xs text-zinc-600">
                      {relativeTimeRO(r.lastOrderAt)}
                    </td>
                    <td className="px-3 py-2.5 align-top text-right">
                      <Link
                        href={`/dashboard?tenant=${r.slug}`}
                        className="text-xs font-medium text-zinc-900 hover:underline"
                      >
                        Deschide
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <p className="text-xs text-zinc-500">
        Lista include toate restaurantele cu vertical RESTAURANT (max. 50 — vom
        adăuga paginare când depășim acest prag). Comenzile sunt din ultimele 7
        zile, exclusiv cele anulate.
      </p>
    </div>
  );
}

function StatusPill({ isLive }: { isLive: boolean }) {
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
