'use client';

import { useState, useTransition } from 'react';
import { assignSponsorAction } from '../actions';

type ActivePartner = { id: string; name: string; email: string };

type SponsorRow = {
  sponsor_partner_id: string;
  override_pct_y1: number;
  override_pct_recurring: number;
  sunset_at: string | null;
};

export function SponsorPanel({
  subPartnerId,
  allActivePartners,
  existingSponsor,
}: {
  subPartnerId: string;
  allActivePartners: ActivePartner[];
  existingSponsor: SponsorRow | null;
}) {
  const [selectedSponsorId, setSelectedSponsorId] = useState<string>(
    existingSponsor?.sponsor_partner_id ?? '',
  );
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  function handleSave() {
    if (!selectedSponsorId) {
      setResult({ ok: false, msg: 'Selectati un sponsor.' });
      return;
    }
    const sponsorName =
      allActivePartners.find((p) => p.id === selectedSponsorId)?.name ?? selectedSponsorId;
    if (!window.confirm(`Atribuie ${sponsorName} ca sponsor pentru acest partener?`)) return;

    setResult(null);
    startTransition(async () => {
      const res = await assignSponsorAction(subPartnerId, selectedSponsorId);
      setResult(
        res.ok
          ? { ok: true, msg: `Sponsor atribuit: ${sponsorName}` }
          : { ok: false, msg: res.error },
      );
    });
  }

  const currentSponsor = existingSponsor
    ? allActivePartners.find((p) => p.id === existingSponsor.sponsor_partner_id)
    : null;

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
      <h2 className="mb-1 text-base font-semibold text-zinc-900">Sponsor (override Layer 2)</h2>
      <p className="mb-4 text-xs text-zinc-500">
        Sponsorul primeste override din restaurantele aduse de acest partener (10% Y1 / 6% recurring,
        pana la 24 luni). Un singur sponsor per sub-reseller.
      </p>

      {existingSponsor && (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
          <span className="font-medium">Sponsor curent: </span>
          {currentSponsor ? `${currentSponsor.name} (${currentSponsor.email})` : existingSponsor.sponsor_partner_id}
          {' — '}
          override {existingSponsor.override_pct_y1}% Y1 / {existingSponsor.override_pct_recurring}% recurring
          {existingSponsor.sunset_at && (
            <> · expira {new Date(existingSponsor.sunset_at).toLocaleDateString('ro-RO')}</>
          )}
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex flex-col gap-1 flex-1">
          <label htmlFor="sponsor-select" className="text-xs font-medium text-zinc-700">
            {existingSponsor ? 'Schimba sponsor' : 'Atribuie sponsor'}
          </label>
          <select
            id="sponsor-select"
            value={selectedSponsorId}
            onChange={(e) => {
              setSelectedSponsorId(e.target.value);
              setResult(null);
            }}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm"
          >
            <option value="">— selecteaza partener —</option>
            {allActivePartners.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.email})
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={pending || !selectedSponsorId}
          className="rounded-md bg-violet-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50"
        >
          {pending ? 'Se salveaza...' : 'Salveaza sponsor'}
        </button>
      </div>

      {result && (
        <p className={`mt-2 text-xs ${result.ok ? 'text-emerald-600' : 'text-rose-600'}`}>
          {result.msg}
        </p>
      )}
    </section>
  );
}
