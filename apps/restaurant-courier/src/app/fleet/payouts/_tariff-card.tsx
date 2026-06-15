'use client';

import { useState, useTransition } from 'react';
import { Banknote, Loader2, RefreshCw, Save } from 'lucide-react';
import { toast } from '@hir/ui';
import {
  generateCurrentWeekPayoutsAction,
  setFleetFlatTariffAction,
} from './tariff-actions';

/**
 * Fleet tariff configuration card on the payouts page. The fleet sets the FLAT
 * rate it pays its couriers per delivery (+ optional COD bonus). This drives
 * automatic settlement generation. Per-zone overrides are a later enhancement;
 * a flat rate is exactly what zone-less cities (e.g. București) need today.
 *
 * Also exposes a "generate now" button so the manager can settle the running
 * week on demand instead of waiting for the Monday cron.
 */
export function FleetTariffCard({
  payoutCents,
  codBonusCents,
}: {
  payoutCents: number | null;
  codBonusCents: number;
}) {
  const [payout, setPayout] = useState(
    payoutCents != null ? (payoutCents / 100).toString() : '',
  );
  const [cod, setCod] = useState(codBonusCents ? (codBonusCents / 100).toString() : '');
  const [savePending, startSave] = useTransition();
  const [genPending, startGen] = useTransition();

  function onSave() {
    const fd = new FormData();
    fd.set('payout_ron', payout);
    fd.set('cod_bonus_ron', cod);
    startSave(async () => {
      const r = await setFleetFlatTariffAction(fd);
      if (r.ok) toast.success('Tarif salvat. Se aplică la următoarea generare.');
      else toast.error(r.error);
    });
  }

  function onGenerate() {
    startGen(async () => {
      const r = await generateCurrentWeekPayoutsAction();
      if (r.ok) toast.success('Decontări generate pentru săptămâna curentă.');
      else toast.error(r.error);
    });
  }

  return (
    <section className="rounded-2xl border border-hir-border bg-hir-surface p-4">
      <div className="mb-3 flex items-center gap-2">
        <span
          aria-hidden
          className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/15 ring-1 ring-emerald-500/30"
        >
          <Banknote className="h-4 w-4 text-emerald-300" strokeWidth={2.25} />
        </span>
        <div>
          <h2 className="text-sm font-semibold text-hir-fg">Tarif curieri</h2>
          <p className="text-[11px] text-hir-muted-fg">
            Cât plătește flota ta curierului pe livrare. Tu decizi tariful.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-hir-muted-fg">
            RON / livrare
          </span>
          <input
            type="text"
            inputMode="decimal"
            value={payout}
            onChange={(e) => setPayout(e.target.value)}
            placeholder="ex. 15"
            className="min-h-[44px] rounded-lg border border-hir-border bg-hir-bg px-3 text-sm tabular-nums text-hir-fg transition-colors focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-hir-muted-fg">
            Bonus COD (opțional)
          </span>
          <input
            type="text"
            inputMode="decimal"
            value={cod}
            onChange={(e) => setCod(e.target.value)}
            placeholder="ex. 2"
            className="min-h-[44px] rounded-lg border border-hir-border bg-hir-bg px-3 text-sm tabular-nums text-hir-fg transition-colors focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          />
        </label>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onSave}
          disabled={savePending}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 disabled:opacity-60"
        >
          {savePending ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Save className="h-4 w-4" aria-hidden />
          )}
          Salvează tariful
        </button>
        <button
          type="button"
          onClick={onGenerate}
          disabled={genPending}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-hir-border bg-hir-bg px-4 text-sm font-semibold text-hir-fg transition-colors hover:bg-hir-border/60 disabled:opacity-60"
        >
          {genPending ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <RefreshCw className="h-4 w-4" aria-hidden />
          )}
          Generează decontări (săpt. curentă)
        </button>
      </div>

      <p className="mt-2 text-[11px] leading-relaxed text-hir-muted-fg">
        HIR calculează raportul; tu plătești curierul prin transfer bancar.
        Perioadele se generează automat lunea, sau pe loc cu butonul de mai sus.
      </p>
    </section>
  );
}
