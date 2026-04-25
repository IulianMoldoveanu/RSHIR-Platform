'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { saveOperationsAction, type OperationsSettings, type OperationsActionResult } from './actions';

const DAYS: { key: keyof OperationsSettings['opening_hours']; label: string }[] = [
  { key: 'mon', label: 'Luni' },
  { key: 'tue', label: 'Marți' },
  { key: 'wed', label: 'Miercuri' },
  { key: 'thu', label: 'Joi' },
  { key: 'fri', label: 'Vineri' },
  { key: 'sat', label: 'Sâmbătă' },
  { key: 'sun', label: 'Duminică' },
];

export function OperationsClient({
  initial,
  canEdit,
  tenantId,
}: {
  initial: OperationsSettings;
  canEdit: boolean;
  tenantId: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [accepting, setAccepting] = useState(initial.is_accepting_orders);
  const [reason, setReason] = useState(initial.pause_reason ?? '');
  const [eta, setEta] = useState(String(initial.pickup_eta_minutes));
  const [hours, setHours] = useState(initial.opening_hours);
  const [feedback, setFeedback] = useState<OperationsActionResult | null>(null);

  function updateWindow(day: keyof OperationsSettings['opening_hours'], idx: number, field: 'open' | 'close', value: string) {
    setHours((h) => ({
      ...h,
      [day]: h[day].map((w, i) => (i === idx ? { ...w, [field]: value } : w)),
    }));
  }

  function addWindow(day: keyof OperationsSettings['opening_hours']) {
    setHours((h) => ({
      ...h,
      [day]: [...h[day], { open: '10:00', close: '22:00' }],
    }));
  }

  function removeWindow(day: keyof OperationsSettings['opening_hours'], idx: number) {
    setHours((h) => ({ ...h, [day]: h[day].filter((_, i) => i !== idx) }));
  }

  function submit() {
    setFeedback(null);
    const etaNum = Number(eta);
    if (!Number.isFinite(etaNum) || etaNum < 1) {
      setFeedback({ ok: false, error: 'invalid_input', detail: 'ETA trebuie să fie un număr pozitiv.' });
      return;
    }
    start(async () => {
      const result = await saveOperationsAction(
        {
          is_accepting_orders: accepting,
          pause_reason: reason.trim() || null,
          pickup_eta_minutes: etaNum,
          opening_hours: hours,
        },
        tenantId,
      );
      setFeedback(result);
      if (result.ok) router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <section className="rounded-lg border border-zinc-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-zinc-900">Stare comenzi</h2>
        <p className="mt-1 text-xs text-zinc-600">
          Când e oprit, storefront-ul afișează un banner și blochează checkout-ul.
        </p>

        <label className="mt-3 inline-flex items-center gap-3">
          <input
            type="checkbox"
            disabled={!canEdit}
            checked={accepting}
            onChange={(e) => setAccepting(e.target.checked)}
            className="h-4 w-4"
          />
          <span className="text-sm text-zinc-900">Acceptăm comenzi acum</span>
        </label>

        {!accepting && (
          <div className="mt-3">
            <label className="block text-xs font-medium text-zinc-600">
              Motiv (opțional, vizibil clientului)
            </label>
            <input
              type="text"
              disabled={!canEdit}
              maxLength={200}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Inchis exceptional astazi"
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none"
            />
          </div>
        )}

        <div className="mt-4">
          <label className="block text-xs font-medium text-zinc-600">
            ETA pickup (minute)
          </label>
          <input
            type="number"
            min={1}
            max={480}
            disabled={!canEdit}
            value={eta}
            onChange={(e) => setEta(e.target.value)}
            className="mt-1 w-32 rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none"
          />
        </div>
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-zinc-900">Program săptămânal</h2>
        <p className="mt-1 text-xs text-zinc-600">
          Adaugă mai multe intervale dacă închizi la prânz (ex. 10:00–14:00 + 17:00–22:00).
          Lasă lista goală pentru zilele închise.
        </p>

        <div className="mt-4 flex flex-col gap-3">
          {DAYS.map(({ key, label }) => {
            const windows = hours[key];
            return (
              <div key={key} className="flex flex-col gap-2 rounded-md border border-zinc-200 p-3 sm:flex-row sm:items-start sm:gap-4">
                <div className="w-24 shrink-0 text-sm font-medium text-zinc-900">{label}</div>
                <div className="flex flex-1 flex-col gap-2">
                  {windows.length === 0 ? (
                    <p className="text-xs text-zinc-500">Închis</p>
                  ) : (
                    windows.map((w, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <input
                          type="time"
                          disabled={!canEdit}
                          value={w.open}
                          onChange={(e) => updateWindow(key, idx, 'open', e.target.value)}
                          className="rounded-md border border-zinc-300 px-2 py-1 text-sm focus:border-zinc-900 focus:outline-none"
                        />
                        <span className="text-zinc-400">–</span>
                        <input
                          type="time"
                          disabled={!canEdit}
                          value={w.close}
                          onChange={(e) => updateWindow(key, idx, 'close', e.target.value)}
                          className="rounded-md border border-zinc-300 px-2 py-1 text-sm focus:border-zinc-900 focus:outline-none"
                        />
                        {canEdit && (
                          <button
                            type="button"
                            onClick={() => removeWindow(key, idx)}
                            className="rounded-md border border-rose-200 bg-white px-2 py-1 text-xs text-rose-700 hover:bg-rose-50"
                          >
                            Șterge
                          </button>
                        )}
                      </div>
                    ))
                  )}
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => addWindow(key)}
                      className="self-start rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-50"
                    >
                      + Adaugă interval
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {canEdit && (
        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={pending}
            onClick={submit}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {pending ? 'Salvez...' : 'Salvează'}
          </button>
          {feedback && <FeedbackBanner result={feedback} />}
        </div>
      )}
    </div>
  );
}

function FeedbackBanner({ result }: { result: OperationsActionResult }) {
  if (result.ok) {
    return (
      <span className="text-xs text-emerald-700">Setări salvate.</span>
    );
  }
  const map: Record<string, string> = {
    forbidden_owner_only: 'Doar OWNER poate modifica setările.',
    unauthenticated: 'Sesiune expirată — autentifică-te din nou.',
    invalid_input: 'Input invalid.',
    db_error: 'Eroare la salvarea în baza de date.',
  };
  return (
    <span className="text-xs text-rose-700">
      {map[result.error] ?? result.error}
      {result.detail ? ` (${result.detail})` : ''}
    </span>
  );
}
