'use client';

import { useState, useTransition } from 'react';
import { assignWaveAction } from '../actions';
import type { WaveLabel } from '@/lib/partner-v3-constants';

type WaveBonus = {
  slot_cap: number;
  direct_y1: number;
  direct_recurring: number;
  override_y1: number;
  override_recurring: number;
  description: string;
};

const WAVE_OPTIONS: WaveLabel[] = ['W0', 'W1', 'W2', 'W3', 'OPEN'];
const PERMANENT_WAVES: WaveLabel[] = ['W0', 'W1', 'W2'];

export function WavePanel({
  partnerId,
  currentWave,
  waveJoinedAt,
  waveBonuses,
  waveCountMap,
}: {
  partnerId: string;
  currentWave: WaveLabel;
  waveJoinedAt: string | null;
  waveBonuses: Record<WaveLabel, WaveBonus>;
  waveCountMap: Partial<Record<WaveLabel, number>>;
}) {
  const [selected, setSelected] = useState<WaveLabel>(currentWave);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  function handleSave() {
    if (selected === currentWave) {
      setResult({ ok: false, msg: 'Valul selectat este deja cel curent.' });
      return;
    }

    const isPermanent = PERMANENT_WAVES.includes(selected);
    const confirmMsg = isPermanent
      ? `ATENȚIE: Atribuirea în ${selected} acordă bonusuri PERMANENTE (PE VIAȚĂ). Această acțiune nu poate fi retrasă automat. Confirmi atribuirea lui ${selected}?`
      : `Atribuie partenerul în ${selected}?`;

    if (!window.confirm(confirmMsg)) return;

    setResult(null);
    startTransition(async () => {
      const res = await assignWaveAction(partnerId, selected);
      setResult(res.ok ? { ok: true, msg: `Val actualizat la ${selected}.` } : { ok: false, msg: res.error });
    });
  }

  const bonus = waveBonuses[selected];
  const slots = bonus.slot_cap;
  const usedSlots = waveCountMap[selected] ?? 0;
  const slotsRemaining = slots === -1 ? null : Math.max(0, slots - usedSlots);

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
      <h2 className="mb-1 text-base font-semibold text-zinc-900">Atribuire Val (Wave)</h2>
      <p className="mb-4 text-xs text-zinc-500">
        Val curent: <strong>{currentWave}</strong>
        {waveJoinedAt && (
          <> — atribuit la {new Date(waveJoinedAt).toLocaleDateString('ro-RO')}</>
        )}
        . Valurile W0/W1/W2 acorda bonusuri PERMANENTE — confirmare obligatorie.
      </p>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="flex flex-col gap-2">
          <label htmlFor="wave-select" className="text-xs font-medium text-zinc-700">
            Val nou
          </label>
          <select
            id="wave-select"
            value={selected}
            onChange={(e) => {
              setSelected(e.target.value as WaveLabel);
              setResult(null);
            }}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm"
          >
            {WAVE_OPTIONS.map((w) => (
              <option key={w} value={w}>
                {w}
              </option>
            ))}
          </select>
        </div>

        {/* Bonus info for selected wave */}
        <div className="flex-1 rounded-lg border border-zinc-100 bg-zinc-50 p-3 text-xs text-zinc-700">
          <div className="font-medium text-zinc-900">{selected}</div>
          <div className="mt-1">{bonus.description}</div>
          {slots !== -1 && (
            <div className="mt-1 text-zinc-500">
              Sloturi: {usedSlots} / {slots} folosite
              {slotsRemaining !== null && slotsRemaining <= 0 && (
                <span className="ml-1 font-medium text-rose-600">(PLIN)</span>
              )}
              {slotsRemaining !== null && slotsRemaining > 0 && (
                <span className="ml-1 text-emerald-700">({slotsRemaining} ramase)</span>
              )}
            </div>
          )}
          {PERMANENT_WAVES.includes(selected) && (
            <div className="mt-2 font-semibold text-amber-700">
              BONUS PERMANENT — nu poate fi retras dupa acordare.
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={pending || selected === currentWave}
          className="rounded-md bg-violet-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50"
        >
          {pending ? 'Se salveaza...' : 'Salveaza val'}
        </button>
        {result && (
          <p className={`text-xs ${result.ok ? 'text-emerald-600' : 'text-rose-600'}`}>
            {result.msg}
          </p>
        )}
      </div>
    </section>
  );
}
