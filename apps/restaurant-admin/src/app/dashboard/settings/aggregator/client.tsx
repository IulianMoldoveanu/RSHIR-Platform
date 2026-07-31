'use client';

// Lane HIRforYOU-MARKETPLACE (2026-05-28) — client UI for the patron-facing
// HIRforYOU marketplace opt-in toggle.

import { useState, useTransition } from 'react';
import { Check, ExternalLink, Store, Users } from 'lucide-react';
import {
  enableMarketplace,
  disableMarketplace,
  setMarketplaceVisibility,
} from './actions';

type Props = {
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  citySlug: string | null;
  canEdit: boolean;
  enabled: boolean;
  visibility: 'private' | 'public' | 'invite_only';
  reviewCount: number;
  ordersLast30d: number;
};

const MARKETING_HOST = process.env.NEXT_PUBLIC_PRIMARY_DOMAIN || 'hirforyou.ro';

export function AggregatorSettingsClient({
  tenantId,
  tenantSlug,
  tenantName,
  citySlug,
  canEdit,
  enabled,
  visibility,
  reviewCount,
  ordersLast30d,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const eligible = reviewCount >= 1 || ordersLast30d >= 10;
  const publicUrl =
    citySlug
      ? `https://${MARKETING_HOST}/restaurante/${citySlug}/${tenantSlug}`
      : `https://${MARKETING_HOST}/restaurante`;

  const onEnable = () =>
    startTransition(async () => {
      setError(null);
      const r = await enableMarketplace(tenantId);
      if (!r.ok) setError(r.error);
    });

  const onDisable = () =>
    startTransition(async () => {
      setError(null);
      const r = await disableMarketplace(tenantId);
      if (!r.ok) setError(r.error);
    });

  const onSetVisibility = (v: 'public' | 'invite_only') =>
    startTransition(async () => {
      setError(null);
      const r = await setMarketplaceVisibility(tenantId, v);
      if (!r.ok) setError(r.error);
    });

  return (
    <div className="flex flex-col gap-6">
      {/* Pitch */}
      <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <Store className="mt-0.5 h-5 w-5 flex-none text-indigo-600" />
          <div>
            <h2 className="text-base font-semibold text-zinc-900">
              Apari pe HIRforYOU Marketplace
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-zinc-600">
              Clienții navighează pe <span className="font-medium">{MARKETING_HOST}/restaurante</span> și
              comandă direct prin platforma noastră. Restaurantul tău primește încă un canal de
              vânzări fără să își schimbe site-ul, meniul sau procesul.
            </p>
            <ul className="mt-3 space-y-1.5 text-sm text-zinc-600">
              <li className="flex items-start gap-2">
                <Check className="mt-0.5 h-4 w-4 flex-none text-emerald-600" />
                Clientul plătește prețul de pe meniu, identic cu site-ul tău.
              </li>
              <li className="flex items-start gap-2">
                <Check className="mt-0.5 h-4 w-4 flex-none text-emerald-600" />
                HIR ia 2 lei/comandă fix din marketplace, restul îți rămâne.
              </li>
              <li className="flex items-start gap-2">
                <Check className="mt-0.5 h-4 w-4 flex-none text-emerald-600" />
                Comenzile intră în același dashboard, ca toate celelalte.
              </li>
              <li className="flex items-start gap-2">
                <Check className="mt-0.5 h-4 w-4 flex-none text-emerald-600" />
                Anulezi oricând fără penalități.
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* Eligibility */}
      <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-zinc-900">Eligibilitate pentru listare publică</h3>
        <p className="mt-1 text-xs text-zinc-500">
          Pentru ca restaurantul tău să apară în lista publică, ai nevoie de cel puțin 1 recenzie SAU
          10 comenzi în ultimele 30 de zile. Până atunci, listarea rămâne pe „doar acces direct".
        </p>
        <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-lg bg-zinc-50 p-3">
            <p className="text-xs text-zinc-500">Recenzii</p>
            <p className="mt-1 text-lg font-semibold text-zinc-900">{reviewCount}</p>
          </div>
          <div className="rounded-lg bg-zinc-50 p-3">
            <p className="text-xs text-zinc-500">Comenzi / 30 zile</p>
            <p className="mt-1 text-lg font-semibold text-zinc-900">{ordersLast30d}</p>
          </div>
        </div>
        {eligible ? (
          <p className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
            <Check className="h-3.5 w-3.5" />
            Ești eligibil pentru listarea publică.
          </p>
        ) : (
          <p className="mt-3 text-xs font-medium text-amber-700">
            Încă nu ești eligibil pentru listare publică, dar poți activa modul „acces direct".
          </p>
        )}
      </section>

      {/* Toggle */}
      <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-zinc-900">
              {enabled ? 'Marketplace activ' : 'Marketplace inactiv'}
            </h3>
            <p className="mt-1 text-xs text-zinc-500">
              {enabled
                ? `Restaurantul ${tenantName} apare în HIRforYOU Marketplace cu vizibilitate „${labelFor(visibility)}".`
                : 'Comenzile vin doar prin canalul tău direct. Nimeni nu vede HIR Marketplace.'}
            </p>
          </div>
          {enabled ? (
            <button
              type="button"
              onClick={onDisable}
              disabled={!canEdit || isPending}
              className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
            >
              Dezactivează
            </button>
          ) : (
            <button
              type="button"
              onClick={onEnable}
              disabled={!canEdit || isPending}
              className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              Activează
            </button>
          )}
        </div>

        {enabled ? (
          <div className="mt-4 space-y-3 border-t border-zinc-200 pt-4">
            <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
              Vizibilitate
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => onSetVisibility('public')}
                disabled={!canEdit || isPending || visibility === 'public'}
                className={`rounded-lg border p-3 text-left text-sm transition-colors ${
                  visibility === 'public'
                    ? 'border-indigo-300 bg-indigo-50 ring-1 ring-indigo-200'
                    : 'border-zinc-200 bg-white hover:border-zinc-300'
                } disabled:opacity-50`}
              >
                <p className="font-medium text-zinc-900">
                  Listare publică
                  {visibility === 'public' && (
                    <Check className="ml-1 inline h-3.5 w-3.5 text-emerald-600" />
                  )}
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  Restaurantul tău apare în /restaurante și pe paginile de oraș.
                </p>
              </button>
              <button
                type="button"
                onClick={() => onSetVisibility('invite_only')}
                disabled={!canEdit || isPending || visibility === 'invite_only'}
                className={`rounded-lg border p-3 text-left text-sm transition-colors ${
                  visibility === 'invite_only'
                    ? 'border-indigo-300 bg-indigo-50 ring-1 ring-indigo-200'
                    : 'border-zinc-200 bg-white hover:border-zinc-300'
                } disabled:opacity-50`}
              >
                <p className="font-medium text-zinc-900">
                  Doar acces direct
                  {visibility === 'invite_only' && (
                    <Check className="ml-1 inline h-3.5 w-3.5 text-emerald-600" />
                  )}
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  URL-ul restaurantului este accesibil, dar nu apare în liste.
                </p>
              </button>
            </div>

            {visibility === 'public' ? (
              <a
                href={publicUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:underline"
              >
                Vezi pagina publică <ExternalLink className="h-3 w-3" />
              </a>
            ) : null}
          </div>
        ) : null}

        {error ? (
          <p className="mt-3 rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>
        ) : null}
      </section>

      {/* How clients see you */}
      <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <Users className="mt-0.5 h-5 w-5 flex-none text-indigo-600" />
          <div>
            <h3 className="text-sm font-semibold text-zinc-900">Cum apare cardul tău</h3>
            <p className="mt-1 text-xs text-zinc-500">
              Așa văd clienții restaurantul în listă:
            </p>
            <div className="mt-3 max-w-sm rounded-2xl border border-zinc-200 bg-white p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600 text-base font-semibold text-white">
                  {tenantName.slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-zinc-900">{tenantName}</p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {reviewCount > 0
                      ? `★ ${(0).toFixed(1)} · ${reviewCount} recenzii`
                      : 'Restaurant nou'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function labelFor(v: 'private' | 'public' | 'invite_only'): string {
  if (v === 'public') return 'Listare publică';
  if (v === 'invite_only') return 'Doar acces direct';
  return 'Privat';
}
