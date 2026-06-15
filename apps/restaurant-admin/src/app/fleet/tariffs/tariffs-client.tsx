'use client';

import { useState, useTransition } from 'react';
import { setFleetPickupKmTariffAction } from './actions';

type CourierTariff = {
  pickup_fee_cents: number | null;
  per_km_cents: number | null;
  cod_bonus_cents: number;
  valid_from: string;
  payout_cents: number | null;
} | null;

type VendorTariff = {
  pickup_fee_cents: number;
  per_km_cents: number;
  cod_bonus_cents: number;
  valid_from: string;
} | null;

function ronStr(cents: number | null | undefined): string {
  if (cents == null) return '';
  return (cents / 100).toFixed(2);
}

export function TariffsClient({
  fleetName,
  courier,
  vendor,
}: {
  fleetName: string;
  courier: CourierTariff;
  vendor: VendorTariff;
}) {
  return (
    <div className="space-y-6">
      <TariffSection
        kind="courier"
        title="Tarif pentru curieri"
        subtitle={`Cât plătește ${fleetName} fiecărui curier per livrare.`}
        helper="Folosit la calcularea câștigurilor curierului în aplicația HIR Curier și la decontările săptămânale (luni dimineața pentru săptămâna precedentă)."
        initialPickup={courier?.pickup_fee_cents ?? courier?.payout_cents ?? null}
        initialPerKm={courier?.per_km_cents ?? null}
        initialCod={courier?.cod_bonus_cents ?? 0}
        validFrom={courier?.valid_from ?? null}
      />
      <TariffSection
        kind="vendor"
        title="Tarif încasat de la vendori"
        subtitle={`Cât factureaz─â ${fleetName} unui vendor (restaurant/farmacie) per livrare.`}
        helper="Folosit dacă ai contract direct cu vendorul în afara schemei HIR. Independent de tarifele platformei (zonele HIR sunt configurate separat de admin)."
        initialPickup={vendor?.pickup_fee_cents ?? null}
        initialPerKm={vendor?.per_km_cents ?? null}
        initialCod={vendor?.cod_bonus_cents ?? 0}
        validFrom={vendor?.valid_from ?? null}
      />
    </div>
  );
}

function TariffSection({
  kind,
  title,
  subtitle,
  helper,
  initialPickup,
  initialPerKm,
  initialCod,
  validFrom,
}: {
  kind: 'courier' | 'vendor';
  title: string;
  subtitle: string;
  helper: string;
  initialPickup: number | null;
  initialPerKm: number | null;
  initialCod: number;
  validFrom: string | null;
}) {
  const [pickup, setPickup] = useState(ronStr(initialPickup));
  const [perKm, setPerKm] = useState(ronStr(initialPerKm));
  const [cod, setCod] = useState(ronStr(initialCod || null));
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSave() {
    setError(null);
    setSuccess(null);
    const fd = new FormData();
    fd.set('pickup_fee_ron', pickup);
    fd.set('per_km_ron', perKm);
    fd.set('cod_bonus_ron', cod);
    startTransition(async () => {
      const res = await setFleetPickupKmTariffAction(kind, fd);
      if (!res.ok) setError(res.error ?? 'Eroare la salvare.');
      else setSuccess('Tarif salvat. Se aplică la următoarea calculare.');
    });
  }

  // Live preview: payout for a sample 5km delivery.
  const previewKm = 5;
  const pickupN = parseFloat(pickup.replace(',', '.')) || 0;
  const perKmN = parseFloat(perKm.replace(',', '.')) || 0;
  const codN = parseFloat(cod.replace(',', '.')) || 0;
  const previewTotal = pickupN + perKmN * previewKm;

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-5">
      <div>
        <h2 className="text-base font-semibold text-zinc-900">{title}</h2>
        <p className="mt-0.5 text-xs text-zinc-600">{subtitle}</p>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label className="block text-xs font-medium text-zinc-600">
            Tarif fix pickup (RON)
          </label>
          <input
            type="text"
            inputMode="decimal"
            value={pickup}
            onChange={(e) => setPickup(e.target.value)}
            placeholder="ex. 8"
            disabled={pending}
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none disabled:bg-zinc-100"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-600">
            Plată per km (RON/km)
          </label>
          <input
            type="text"
            inputMode="decimal"
            value={perKm}
            onChange={(e) => setPerKm(e.target.value)}
            placeholder="ex. 1.50"
            disabled={pending}
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none disabled:bg-zinc-100"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-600">
            Bonus COD (RON, opțional)
          </label>
          <input
            type="text"
            inputMode="decimal"
            value={cod}
            onChange={(e) => setCod(e.target.value)}
            placeholder="ex. 2"
            disabled={pending}
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none disabled:bg-zinc-100"
          />
        </div>
      </div>

      <div className="mt-3 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-700">
        <strong>Exemplu:</strong> O livrare de {previewKm} km ar însemna{' '}
        <strong>{previewTotal.toFixed(2)} RON</strong>
        {codN > 0 ? <> + bonus COD {codN.toFixed(2)} RON</> : null}
        {' '}({pickup || '0'} RON pickup + {previewKm} × {perKm || '0'} RON/km).
      </div>

      <p className="mt-3 text-[11px] text-zinc-500">{helper}</p>

      {validFrom ? (
        <p className="mt-1 text-[11px] text-zinc-400">
          Tarif activ din: {new Date(validFrom).toLocaleString('ro-RO')}
        </p>
      ) : (
        <p className="mt-1 text-[11px] text-amber-600">
          Niciun tarif salvat pentru acest tip — completează valorile și apasă &ldquo;Salvează&rdquo;.
        </p>
      )}

      {error ? (
        <p className="mt-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="mt-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
          {success}
        </p>
      ) : null}

      <div className="mt-4">
        <button
          type="button"
          onClick={onSave}
          disabled={pending || !pickup.trim() || !perKm.trim()}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {pending ? 'Se salvează...' : 'Salvează tariful'}
        </button>
      </div>
    </section>
  );
}
