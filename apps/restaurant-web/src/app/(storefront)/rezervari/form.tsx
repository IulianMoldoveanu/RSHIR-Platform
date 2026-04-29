'use client';

import { useState, useTransition } from 'react';
import { CheckCircle2, AlertCircle } from 'lucide-react';
import { requestReservation } from './actions';

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function defaultDate(advanceMinMinutes: number): string {
  const t = new Date(Date.now() + (advanceMinMinutes + 30) * 60_000);
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
}
function defaultTime(advanceMinMinutes: number): string {
  const t = new Date(Date.now() + (advanceMinMinutes + 30) * 60_000);
  // Round to next half-hour for nicer UX
  const m = t.getMinutes();
  const next = m < 30 ? 30 : 60;
  t.setMinutes(next - m);
  return `${pad(t.getHours())}:${pad(t.getMinutes())}`;
}

function maxDate(advanceMaxDays: number): string {
  const t = new Date(Date.now() + advanceMaxDays * 86_400_000);
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
}

export function ReservationForm({
  advanceMinMinutes,
  advanceMaxDays,
  partySizeMax,
}: {
  advanceMinMinutes: number;
  advanceMaxDays: number;
  partySizeMax: number;
}) {
  const [submitting, start] = useTransition();
  const [success, setSuccess] = useState<{ message: string; trackToken: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [firstName, setFirstName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [partySize, setPartySize] = useState(2);
  const [date, setDate] = useState(defaultDate(advanceMinMinutes));
  const [time, setTime] = useState(defaultTime(advanceMinMinutes));
  const [notes, setNotes] = useState('');

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    // Combine date + time into ISO with the user's local timezone offset
    // (the server stores it as timestamptz and the RPC compares against now()).
    const local = new Date(`${date}T${time}:00`);
    const isoLocal = local.toISOString();

    start(async () => {
      const result = await requestReservation({
        first_name: firstName,
        phone,
        email,
        party_size: partySize,
        requested_at: isoLocal,
        notes,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSuccess({
        message:
          'Rezervarea a fost înregistrată. Vă vom confirma în scurt timp prin telefon.',
        trackToken: result.trackToken,
      });
    });
  }

  if (success) {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-5 text-center">
        <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" aria-hidden />
        <h2 className="mt-3 text-lg font-semibold text-emerald-900">
          Rezervare trimisă
        </h2>
        <p className="mt-2 text-sm text-emerald-800">{success.message}</p>
        <a
          href={`/rezervari/track/${success.trackToken}`}
          className="mt-4 inline-flex h-10 items-center justify-center rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-800"
        >
          Vezi statusul rezervării
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {error && (
        <div className="flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-none" aria-hidden />
          <span>{error}</span>
        </div>
      )}

      <label className="flex flex-col gap-1 text-xs">
        <span className="font-medium text-zinc-700">Numele tău *</span>
        <input
          type="text"
          required
          maxLength={100}
          className="rounded-md border border-zinc-200 px-3 py-2 text-sm"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          placeholder="Andrei"
        />
      </label>

      <label className="flex flex-col gap-1 text-xs">
        <span className="font-medium text-zinc-700">Telefon *</span>
        <input
          type="tel"
          required
          maxLength={40}
          className="rounded-md border border-zinc-200 px-3 py-2 text-sm"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+40 7XX XXX XXX"
        />
      </label>

      <label className="flex flex-col gap-1 text-xs">
        <span className="font-medium text-zinc-700">Email (opțional)</span>
        <input
          type="email"
          className="rounded-md border border-zinc-200 px-3 py-2 text-sm"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="andrei@email.ro"
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium text-zinc-700">Persoane *</span>
          <input
            type="number"
            required
            min={1}
            max={partySizeMax}
            className="rounded-md border border-zinc-200 px-3 py-2 text-sm"
            value={partySize}
            onChange={(e) =>
              setPartySize(
                Math.max(1, Math.min(partySizeMax, Number(e.target.value) || 1)),
              )
            }
          />
        </label>

        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium text-zinc-700">Ora *</span>
          <input
            type="time"
            required
            step={300}
            className="rounded-md border border-zinc-200 px-3 py-2 text-sm"
            value={time}
            onChange={(e) => setTime(e.target.value)}
          />
        </label>
      </div>

      <label className="flex flex-col gap-1 text-xs">
        <span className="font-medium text-zinc-700">Data *</span>
        <input
          type="date"
          required
          min={defaultDate(advanceMinMinutes)}
          max={maxDate(advanceMaxDays)}
          className="rounded-md border border-zinc-200 px-3 py-2 text-sm"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </label>

      <label className="flex flex-col gap-1 text-xs">
        <span className="font-medium text-zinc-700">Mențiuni (opțional)</span>
        <textarea
          maxLength={500}
          rows={3}
          className="rounded-md border border-zinc-200 px-3 py-2 text-sm"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Aniversare, alergii, preferințe de loc..."
        />
      </label>

      <button
        type="submit"
        disabled={submitting}
        className="mt-2 rounded-md bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:bg-zinc-400"
      >
        {submitting ? 'Se trimite…' : 'Trimite rezervarea'}
      </button>
    </form>
  );
}
