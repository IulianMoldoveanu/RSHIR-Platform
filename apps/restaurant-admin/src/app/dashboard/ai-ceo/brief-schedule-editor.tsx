'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateBriefSchedule } from './actions';

type Props = {
  tenantId: string;
  canEdit: boolean;
  initialEnabled: boolean;
  initialHour: number;
};

const HOURS = Array.from({ length: 24 }, (_, i) => i);

export function BriefScheduleEditor({
  tenantId,
  canEdit,
  initialEnabled,
  initialHour,
}: Props) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [hour, setHour] = useState(initialHour);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);

  if (!canEdit) {
    return (
      <p className="mt-4 text-xs text-zinc-500">
        Doar utilizatorii cu rolul <strong>OWNER</strong> pot modifica orarul.
      </p>
    );
  }

  const dirty = enabled !== initialEnabled || hour !== initialHour;

  const submit = () => {
    setError(null);
    setSaved(false);
    start(async () => {
      const r = await updateBriefSchedule(tenantId, {
        enabled,
        delivery_hour_local: hour,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setSaved(true);
      router.refresh();
    });
  };

  return (
    <div className="mt-4 flex flex-col gap-3 border-t border-zinc-100 pt-4">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor="brief-enabled" className="text-sm text-zinc-700">
          Activ
        </label>
        <button
          id="brief-enabled"
          type="button"
          onClick={() => setEnabled((v) => !v)}
          disabled={pending}
          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
            enabled ? 'bg-emerald-500' : 'bg-zinc-300'
          } disabled:opacity-50`}
          aria-pressed={enabled}
          aria-label={enabled ? 'Dezactivează brief-ul zilnic' : 'Activează brief-ul zilnic'}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              enabled ? 'translate-x-4' : 'translate-x-0.5'
            }`}
          />
        </button>
      </div>

      <div className="flex items-center justify-between gap-3">
        <label htmlFor="brief-hour" className="text-sm text-zinc-700">
          Ora trimitere
        </label>
        <select
          id="brief-hour"
          value={hour}
          onChange={(e) => setHour(Number(e.target.value))}
          disabled={pending || !enabled}
          className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-sm tabular-nums text-zinc-900 focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50"
        >
          {HOURS.map((h) => (
            <option key={h} value={h}>
              {String(h).padStart(2, '0')}:00
            </option>
          ))}
        </select>
      </div>

      {error && (
        <p className="text-xs text-rose-700">
          {error === 'forbidden'
            ? 'Nu ai permisiune să modifici orarul.'
            : error === 'invalid_input'
              ? 'Date invalide.'
              : 'A apărut o eroare. Încearcă din nou.'}
        </p>
      )}

      {saved && !dirty && (
        <p className="text-xs text-emerald-700">Salvat.</p>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={submit}
          disabled={pending || !dirty}
          className="rounded-md bg-purple-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-purple-700 disabled:opacity-50"
        >
          {pending ? 'Se salvează…' : 'Salvează'}
        </button>
      </div>
    </div>
  );
}
