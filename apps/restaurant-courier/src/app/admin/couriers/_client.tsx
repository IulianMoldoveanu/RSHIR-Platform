'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeftRight, Check, Loader2, X } from 'lucide-react';
import { transferCourierAction } from './actions';

type Courier = {
  user_id: string;
  full_name: string;
  phone: string | null;
  status: string;
  fleet_id: string | null;
  city_id: string | null;
  fleet_name: string | null;
  city_name: string | null;
  city_county: string | null;
};
type FleetOpt = { id: string; name: string; is_active: boolean };
type CityOpt = { id: string; name: string; county: string | null; is_active: boolean };

const STATUS_STYLE: Record<string, string> = {
  ACTIVE: 'bg-emerald-900/60 text-emerald-300',
  INACTIVE: 'bg-hir-border text-hir-muted-fg',
  SUSPENDED: 'bg-rose-900/60 text-rose-300',
};

const SELECT_CLASS =
  'rounded-md border border-hir-border bg-hir-surface px-3 py-2 text-sm text-hir-fg focus:border-violet-500 focus:outline-none';

export function CouriersTransferClient({
  couriers,
  fleets,
  cities,
}: {
  couriers: Courier[];
  fleets: FleetOpt[];
  cities: CityOpt[];
}) {
  const [openId, setOpenId] = useState<string | null>(null);

  if (couriers.length === 0) {
    return (
      <div className="rounded-xl border border-hir-border bg-hir-surface px-6 py-12 text-center">
        <p className="text-sm text-hir-muted-fg">Niciun curier înregistrat încă.</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-hir-border bg-hir-surface">
      <table className="w-full text-sm">
        <thead className="border-b border-hir-border">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-hir-muted-fg">Nume</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-hir-muted-fg">Flotă</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-hir-muted-fg">Oraș</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-hir-muted-fg">Status</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-hir-border">
          {couriers.map((c) => (
            <CourierRow
              key={c.user_id}
              courier={c}
              fleets={fleets}
              cities={cities}
              open={openId === c.user_id}
              onToggle={() => setOpenId(openId === c.user_id ? null : c.user_id)}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CourierRow({
  courier,
  fleets,
  cities,
  open,
  onToggle,
}: {
  courier: Courier;
  fleets: FleetOpt[];
  cities: CityOpt[];
  open: boolean;
  onToggle: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(formData: FormData) {
    setError(null);
    start(async () => {
      const r = await transferCourierAction(formData);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      onToggle();
      router.refresh();
    });
  }

  const activeCities = cities.filter((c) => c.is_active);
  const otherCities = cities.filter((c) => !c.is_active);

  return (
    <>
      <tr className="hover:bg-hir-border/50">
        <td className="px-4 py-3">
          <div className="font-medium text-hir-fg">{courier.full_name}</div>
          {courier.phone ? (
            <div className="text-xs text-hir-muted-fg">{courier.phone}</div>
          ) : null}
        </td>
        <td className="px-4 py-3 text-hir-muted-fg">{courier.fleet_name ?? '—'}</td>
        <td className="px-4 py-3 text-hir-muted-fg">
          {courier.city_name ? (
            <span>
              {courier.city_name}
              {courier.city_county ? (
                <span className="text-hir-muted-fg/70"> · {courier.city_county}</span>
              ) : null}
            </span>
          ) : (
            <span className="text-amber-400">fără oraș</span>
          )}
        </td>
        <td className="px-4 py-3">
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
              STATUS_STYLE[courier.status] ?? 'bg-hir-border text-hir-muted-fg'
            }`}
          >
            {courier.status}
          </span>
        </td>
        <td className="px-4 py-3 text-right">
          <button
            type="button"
            onClick={onToggle}
            className="inline-flex items-center gap-1 rounded px-3 py-1.5 text-xs font-medium text-violet-400 hover:bg-hir-border"
          >
            {open ? (
              <X className="h-3.5 w-3.5" aria-hidden />
            ) : (
              <ArrowLeftRight className="h-3.5 w-3.5" aria-hidden />
            )}
            {open ? 'Anulează' : 'Transferă'}
          </button>
        </td>
      </tr>
      {open ? (
        <tr className="bg-hir-border/20">
          <td colSpan={5} className="px-4 py-4">
            <form
              action={handleSubmit}
              className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end"
            >
              <input type="hidden" name="courier_user_id" value={courier.user_id} />

              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-hir-muted-fg">Flotă destinație</span>
                <select
                  name="to_fleet_id"
                  required
                  defaultValue={courier.fleet_id ?? ''}
                  className={SELECT_CLASS}
                >
                  <option value="" disabled>
                    Alege flota…
                  </option>
                  {fleets.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                      {f.is_active ? '' : ' (inactivă)'}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-hir-muted-fg">Oraș</span>
                <select name="to_city_id" defaultValue={courier.city_id ?? ''} className={SELECT_CLASS}>
                  <option value="">— păstrează orașul actual —</option>
                  {activeCities.length > 0 ? (
                    <optgroup label="Orașe active">
                      {activeCities.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </optgroup>
                  ) : null}
                  <optgroup label="Toate orașele">
                    {otherCities.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                        {c.county ? ` · ${c.county}` : ''}
                      </option>
                    ))}
                  </optgroup>
                </select>
              </label>

              <label className="flex min-w-[160px] flex-1 flex-col gap-1">
                <span className="text-xs font-medium text-hir-muted-fg">Motiv (opțional)</span>
                <input
                  name="reason"
                  maxLength={200}
                  className={SELECT_CLASS}
                  placeholder="ex: relocare în alt oraș"
                />
              </label>

              <button
                type="submit"
                disabled={pending}
                className="inline-flex items-center justify-center gap-2 rounded-md bg-violet-600 px-4 py-2 text-xs font-medium text-white hover:bg-violet-700 disabled:opacity-60"
              >
                {pending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                ) : (
                  <Check className="h-3.5 w-3.5" aria-hidden />
                )}
                Confirmă transferul
              </button>
            </form>
            {error ? (
              <p className="mt-2 rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
                {error}
              </p>
            ) : null}
          </td>
        </tr>
      ) : null}
    </>
  );
}
