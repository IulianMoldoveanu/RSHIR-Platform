'use client';

import { useState, useTransition } from 'react';
import {
  setFleetBillingRateAction,
  generateFleetInvoiceAction,
  advanceFleetInvoiceAction,
} from './actions';

export type PeriodVM = {
  id: string;
  start: string;
  end: string;
  status: 'PENDING' | 'APPROVED' | 'PAID';
  totalCents: number;
  deliveries: number;
  unratedLines: number;
};

export type FleetBillingVM = {
  id: string;
  name: string;
  isActive: boolean;
  perDeliveryCents: number | null;
  rateSince: string | null;
  cityRateCount: number;
  periods: PeriodVM[];
};

const ron = (cents: number) => `${(cents / 100).toFixed(2)} RON`;
const day = (iso: string) => iso.slice(0, 10);

const STATUS_STYLE: Record<PeriodVM['status'], string> = {
  PENDING: 'bg-amber-500/10 text-amber-300 ring-amber-500/30',
  APPROVED: 'bg-sky-500/10 text-sky-300 ring-sky-500/30',
  PAID: 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/30',
};

const STATUS_LABEL: Record<PeriodVM['status'], string> = {
  PENDING: 'În lucru',
  APPROVED: 'Aprobat',
  PAID: 'Plătit',
};

export function FleetBillingClient({ fleets }: { fleets: FleetBillingVM[] }) {
  return (
    <div className="flex flex-col gap-4">
      {fleets.length === 0 ? (
        <p className="text-sm text-slate-500">Nicio flotă.</p>
      ) : (
        fleets.map((f) => <FleetCard key={f.id} fleet={f} />)
      )}
    </div>
  );
}

function FleetCard({ fleet }: { fleet: FleetBillingVM }) {
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  function run(fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) {
    setNote(null);
    startTransition(async () => {
      const r = await fn();
      setNote({ ok: r.ok, text: r.ok ? (r.message ?? 'Salvat.') : (r.error ?? 'A eșuat.') });
    });
  }

  return (
    <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-base font-semibold">
          {fleet.name}
          {!fleet.isActive && <span className="ml-2 text-xs text-slate-500">(inactivă)</span>}
        </h2>
        {fleet.perDeliveryCents === null ? (
          <span className="rounded-full bg-rose-500/10 px-2 py-0.5 text-xs text-rose-300 ring-1 ring-inset ring-rose-500/30">
            Fără tarif — livrările se facturează la 0
          </span>
        ) : (
          <span className="text-sm text-slate-300">
            <strong className="text-slate-100">{ron(fleet.perDeliveryCents)}</strong> pe livrare
            {fleet.rateSince && (
              <span className="ml-1 text-xs text-slate-500">din {day(fleet.rateSince)}</span>
            )}
          </span>
        )}
      </div>

      {fleet.cityRateCount > 0 && (
        <p className="mt-1 text-xs text-slate-500">
          {fleet.cityRateCount} tarif(e) pe oraș au prioritate față de cel de mai sus.
        </p>
      )}

      <form
        action={(fd) => run(() => setFleetBillingRateAction(fleet.id, fd))}
        className="mt-3 flex flex-wrap items-end gap-2"
      >
        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-400">Tarif nou pe livrare (RON)</span>
          <input
            name="per_delivery_ron"
            inputMode="decimal"
            required
            placeholder="15.00"
            className="w-32 rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-100"
          />
        </label>
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-xs text-slate-400">Motiv (opțional)</span>
          <input
            name="reason"
            placeholder="renegociere august"
            className="w-full min-w-[10rem] rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-100"
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-900 disabled:opacity-50"
        >
          Salvează tariful
        </button>
      </form>

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-800 pt-3">
        <span className="text-xs text-slate-400">Generează factura pentru:</span>
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => generateFleetInvoiceAction(fleet.id, 1))}
          className="rounded-md border border-slate-700 px-2.5 py-1 text-xs text-slate-200 disabled:opacity-50"
        >
          săptămâna trecută
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => generateFleetInvoiceAction(fleet.id, 2))}
          className="rounded-md border border-slate-700 px-2.5 py-1 text-xs text-slate-200 disabled:opacity-50"
        >
          acum două săptămâni
        </button>
      </div>

      {note && (
        <p className={`mt-2 text-xs ${note.ok ? 'text-emerald-300' : 'text-rose-300'}`}>{note.text}</p>
      )}

      {fleet.periods.length > 0 && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[34rem] text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="py-1 pr-3 font-medium">Perioadă</th>
                <th className="py-1 pr-3 font-medium">Livrări</th>
                <th className="py-1 pr-3 font-medium">Total</th>
                <th className="py-1 pr-3 font-medium">Stare</th>
                <th className="py-1 font-medium" />
              </tr>
            </thead>
            <tbody>
              {fleet.periods.map((p) => (
                <tr key={p.id} className="border-t border-slate-800/70">
                  <td className="py-1.5 pr-3 text-slate-300">
                    {day(p.start)} → {day(p.end)}
                  </td>
                  <td className="py-1.5 pr-3 text-slate-300">
                    {p.deliveries}
                    {p.unratedLines > 0 && (
                      <span className="ml-1 text-xs text-rose-300">
                        ({p.unratedLines} fără tarif)
                      </span>
                    )}
                  </td>
                  <td className="py-1.5 pr-3 font-medium text-slate-100">{ron(p.totalCents)}</td>
                  <td className="py-1.5 pr-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ring-1 ring-inset ${STATUS_STYLE[p.status]}`}
                    >
                      {STATUS_LABEL[p.status]}
                    </span>
                  </td>
                  <td className="py-1.5">
                    {p.status === 'PENDING' && (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => run(() => advanceFleetInvoiceAction(p.id, 'APPROVED'))}
                        className="rounded-md border border-slate-700 px-2 py-0.5 text-xs text-slate-200 disabled:opacity-50"
                      >
                        Aprobă
                      </button>
                    )}
                    {p.status === 'APPROVED' && (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => run(() => advanceFleetInvoiceAction(p.id, 'PAID'))}
                        className="rounded-md border border-slate-700 px-2 py-0.5 text-xs text-slate-200 disabled:opacity-50"
                      >
                        Marchează plătit
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-slate-500">
            Aprobarea închide perioada: o livrare întârziată intră în săptămâna următoare, nu
            schimbă un total deja agreat.
          </p>
        </div>
      )}
    </section>
  );
}
