'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  toggleZoneActiveAction,
  deleteZoneAction,
  updateZoneFeesAction,
} from './actions';

export type ZoneRow = {
  id: string;
  name: string;
  zone_type: string;
  max_distance_km: number;
  restaurant_fee_cents: number;
  courier_payout_cents: number;
  active: boolean;
  localities: string[] | null;
  geometry: Record<string, unknown> | null;
};

export function ZonesClient({
  cityId: _cityId,
  citySlug,
  cityName,
  fleetCount,
  zones,
}: {
  cityId: string;
  citySlug: string;
  cityName: string;
  fleetCount: number;
  zones: ZoneRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle(id: string, active: boolean) {
    startTransition(async () => {
      setError(null);
      const res = await toggleZoneActiveAction({ zoneId: id, active });
      if (!res.ok) setError(res.error ?? 'Eroare la toggle.');
      router.refresh();
    });
  }

  function remove(id: string, name: string) {
    if (!confirm(`Sterg zona "${name}"? Operatia este reversibila doar prin migratie SQL.`)) return;
    startTransition(async () => {
      setError(null);
      const res = await deleteZoneAction({ zoneId: id });
      if (!res.ok) setError(res.error ?? 'Eroare la stergere.');
      router.refresh();
    });
  }

  async function saveFees(id: string, restaurantRon: number, courierRon: number) {
    startTransition(async () => {
      setError(null);
      const res = await updateZoneFeesAction({
        zoneId: id,
        restaurant_fee_cents: Math.round(restaurantRon * 100),
        courier_payout_cents: Math.round(courierRon * 100),
      });
      if (!res.ok) setError(res.error ?? 'Eroare la salvare.');
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {error ? (
        <div className="rounded-md border border-rose-500/40 bg-rose-500/10 px-4 py-2 text-sm text-rose-200">
          {error}
        </div>
      ) : null}

      {zones.length === 0 ? (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-200">
          <strong>{cityName}</strong> nu are zone de pret. Storefront-ul va functiona dar
          settlement-ul (taxa restaurant + payout curier) NU va fi calculat pentru livrarile din acest oras.
          Adauga zone via migratie SQL (vezi <code className="font-mono">supabase/migrations/20260615_003_pricing_zones_bucuresti.sql</code>).
        </div>
      ) : null}

      {fleetCount === 0 ? (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-200">
          Nicio flota activa cu primary_city_id = {citySlug}. Dispatch-ul nu va functiona aici
          pana cand cel putin o flota se inregistreaza cu acest oras (sau o flota fara
          city_id ramane in pool-ul wildcard).
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-slate-800">
        <table className="w-full text-sm">
          <thead className="bg-slate-900/60 text-xs uppercase text-slate-400">
            <tr>
              <th className="px-4 py-2 text-left">Nume</th>
              <th className="px-4 py-2 text-left">Tip</th>
              <th className="px-4 py-2 text-right">Max km</th>
              <th className="px-4 py-2 text-right">Taxa restaurant</th>
              <th className="px-4 py-2 text-right">Plata curier</th>
              <th className="px-4 py-2 text-center">Activ</th>
              <th className="px-4 py-2 text-right">Actiuni</th>
            </tr>
          </thead>
          <tbody>
            {zones.map((z) => (
              <ZoneRowEditor
                key={z.id}
                zone={z}
                pending={pending}
                onToggle={toggle}
                onSaveFees={saveFees}
                onRemove={remove}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ZoneRowEditor({
  zone,
  pending,
  onToggle,
  onSaveFees,
  onRemove,
}: {
  zone: ZoneRow;
  pending: boolean;
  onToggle: (id: string, active: boolean) => void;
  onSaveFees: (id: string, restaurantRon: number, courierRon: number) => void;
  onRemove: (id: string, name: string) => void;
}) {
  const [rest, setRest] = useState((zone.restaurant_fee_cents / 100).toFixed(2));
  const [courier, setCourier] = useState((zone.courier_payout_cents / 100).toFixed(2));
  const dirty =
    parseFloat(rest) !== zone.restaurant_fee_cents / 100 ||
    parseFloat(courier) !== zone.courier_payout_cents / 100;

  return (
    <tr className="border-t border-slate-800">
      <td className="px-4 py-2">{zone.name}</td>
      <td className="px-4 py-2 text-slate-400">{zone.zone_type}</td>
      <td className="px-4 py-2 text-right tabular-nums">{zone.max_distance_km}</td>
      <td className="px-4 py-2 text-right">
        <input
          type="number"
          step="0.5"
          min="0"
          value={rest}
          onChange={(e) => setRest(e.target.value)}
          disabled={pending}
          className="w-20 rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-right text-sm text-slate-100"
        />
        <span className="ml-1 text-xs text-slate-400">RON</span>
      </td>
      <td className="px-4 py-2 text-right">
        <input
          type="number"
          step="0.5"
          min="0"
          value={courier}
          onChange={(e) => setCourier(e.target.value)}
          disabled={pending}
          className="w-20 rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-right text-sm text-slate-100"
        />
        <span className="ml-1 text-xs text-slate-400">RON</span>
      </td>
      <td className="px-4 py-2 text-center">
        <button
          type="button"
          onClick={() => onToggle(zone.id, !zone.active)}
          disabled={pending}
          className={`rounded-full px-3 py-1 text-xs font-semibold ${
            zone.active ? 'bg-emerald-600 text-white' : 'bg-slate-700 text-slate-300'
          }`}
        >
          {zone.active ? 'Activ' : 'Inactiv'}
        </button>
      </td>
      <td className="px-4 py-2 text-right">
        <div className="flex justify-end gap-2">
          {dirty ? (
            <button
              type="button"
              onClick={() => onSaveFees(zone.id, parseFloat(rest), parseFloat(courier))}
              disabled={pending}
              className="rounded-md bg-indigo-600 px-2 py-1 text-xs font-semibold text-white hover:bg-indigo-500"
            >
              Salveaza
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => onRemove(zone.id, zone.name)}
            disabled={pending}
            className="rounded-md border border-rose-700 px-2 py-1 text-xs font-semibold text-rose-300 hover:bg-rose-900/30"
          >
            Sterge
          </button>
        </div>
      </td>
    </tr>
  );
}
