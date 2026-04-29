'use client';

import { useState, useTransition } from 'react';
import { Button, toast } from '@hir/ui';
import {
  confirmReservation,
  rejectReservation,
  cancelReservation,
  markNoShow,
  markCompleted,
  updateReservationSettings,
} from './actions';

type Reservation = {
  id: string;
  customer_first_name: string;
  customer_phone: string;
  customer_email: string | null;
  party_size: number;
  requested_at: string;
  status:
    | 'REQUESTED'
    | 'CONFIRMED'
    | 'REJECTED'
    | 'CANCELLED'
    | 'NOSHOW'
    | 'COMPLETED';
  notes: string | null;
  rejection_reason: string | null;
  created_at: string;
};

type Settings = {
  is_enabled: boolean;
  advance_max_days: number;
  advance_min_minutes: number;
  slot_duration_min: number;
  party_size_max: number;
  capacity_per_slot: number;
  notify_email: string | null;
};

const STATUS_PILL: Record<Reservation['status'], string> = {
  REQUESTED: 'bg-amber-100 text-amber-900',
  CONFIRMED: 'bg-emerald-100 text-emerald-900',
  REJECTED: 'bg-rose-100 text-rose-900',
  CANCELLED: 'bg-zinc-100 text-zinc-700',
  NOSHOW: 'bg-rose-100 text-rose-900',
  COMPLETED: 'bg-blue-100 text-blue-900',
};

const STATUS_LABEL: Record<Reservation['status'], string> = {
  REQUESTED: 'Cerere',
  CONFIRMED: 'Confirmată',
  REJECTED: 'Respinsă',
  CANCELLED: 'Anulată',
  NOSHOW: 'No-show',
  COMPLETED: 'Onorată',
};

function formatRequestedAt(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('ro-RO', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Day key in Bucharest local time so reservations made just before/after
// midnight UTC don't drift into the wrong calendar day in the agenda.
function dayKey(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA', {
    timeZone: 'Europe/Bucharest',
  });
}

function formatDayHeader(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);
  const dKey = dayKey(iso);
  if (dKey === dayKey(today.toISOString())) return 'Astăzi';
  if (dKey === dayKey(tomorrow.toISOString())) return 'Mâine';
  return d.toLocaleDateString('ro-RO', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
  });
}

function formatTimeOnly(iso: string): string {
  return new Date(iso).toLocaleTimeString('ro-RO', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Bucharest',
  });
}

export function ReservationsClient({
  tenantId,
  reservations,
  settings: initialSettings,
}: {
  tenantId: string;
  reservations: Reservation[];
  settings: Settings;
}) {
  const [busy, start] = useTransition();
  const [settings, setSettings] = useState<Settings>(initialSettings);
  const [showSettings, setShowSettings] = useState(false);
  const [view, setView] = useState<'list' | 'agenda'>('list');

  function update<K extends keyof Settings>(key: K, value: Settings[K]) {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  function onConfirm(id: string) {
    start(async () => {
      const r = await confirmReservation({ reservationId: id, expectedTenantId: tenantId });
      if (!r.ok) toast.error(r.error);
      else toast.success('Rezervare confirmată.');
    });
  }
  function onReject(id: string) {
    const reason = window.prompt('Motiv respingere (opțional, va fi vizibil clientului):') ?? '';
    start(async () => {
      const r = await rejectReservation({
        reservationId: id,
        expectedTenantId: tenantId,
        rejectionReason: reason,
      });
      if (!r.ok) toast.error(r.error);
      else toast.success('Rezervare respinsă.');
    });
  }
  function onCancel(id: string) {
    if (!confirm('Anulezi rezervarea?')) return;
    start(async () => {
      const r = await cancelReservation({ reservationId: id, expectedTenantId: tenantId });
      if (!r.ok) toast.error(r.error);
      else toast.success('Rezervare anulată.');
    });
  }
  function onNoShow(id: string) {
    start(async () => {
      const r = await markNoShow({ reservationId: id, expectedTenantId: tenantId });
      if (!r.ok) toast.error(r.error);
      else toast.success('Marcată no-show.');
    });
  }
  function onCompleted(id: string) {
    start(async () => {
      const r = await markCompleted({ reservationId: id, expectedTenantId: tenantId });
      if (!r.ok) toast.error(r.error);
      else toast.success('Rezervare onorată.');
    });
  }

  function onSaveSettings() {
    start(async () => {
      const r = await updateReservationSettings({
        tenantId,
        ...settings,
        notify_email: settings.notify_email ?? '',
      });
      if (!r.ok) toast.error(r.error);
      else {
        toast.success('Setări salvate.');
        setShowSettings(false);
      }
    });
  }

  const pending = reservations.filter((r) => r.status === 'REQUESTED');
  const upcoming = reservations.filter(
    (r) => r.status === 'CONFIRMED' && new Date(r.requested_at) > new Date(),
  );
  const past = reservations.filter(
    (r) =>
      r.status === 'COMPLETED' ||
      r.status === 'NOSHOW' ||
      r.status === 'REJECTED' ||
      r.status === 'CANCELLED' ||
      (r.status === 'CONFIRMED' && new Date(r.requested_at) <= new Date()),
  );

  // Agenda view: group REQUESTED + future CONFIRMED by Bucharest-local day,
  // sorted ascending by time. Operators care about "what's booked tomorrow",
  // not "what was requested most recently".
  const agendaRows = [...pending, ...upcoming].sort(
    (a, b) =>
      new Date(a.requested_at).getTime() - new Date(b.requested_at).getTime(),
  );
  const agendaDays = new Map<string, Reservation[]>();
  for (const r of agendaRows) {
    const k = dayKey(r.requested_at);
    const list = agendaDays.get(k);
    if (list) list.push(r);
    else agendaDays.set(k, [r]);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-md border border-zinc-200 bg-white p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setView('list')}
              className={`rounded px-3 py-1 font-medium transition-colors ${
                view === 'list' ? 'bg-zinc-900 text-white' : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              Listă
            </button>
            <button
              type="button"
              onClick={() => setView('agenda')}
              className={`rounded px-3 py-1 font-medium transition-colors ${
                view === 'agenda' ? 'bg-zinc-900 text-white' : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              Agendă
            </button>
          </div>
          <div className="text-xs text-zinc-500">
            {pending.length} cereri · {upcoming.length} viitoare ·{' '}
            {past.length} istoric
          </div>
        </div>
        <Button
          type="button"
          onClick={() => setShowSettings((s) => !s)}
          variant="outline"
          size="sm"
        >
          {showSettings ? 'Închide setări' : 'Setări'}
        </Button>
      </div>

      {showSettings && (
        <div className="rounded-md border border-zinc-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-zinc-900">
            Setări rezervări
          </h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="flex items-center justify-between gap-2 text-xs">
              <span className="font-medium text-zinc-700">Activează</span>
              <input
                type="checkbox"
                className="h-4 w-4 accent-emerald-600"
                checked={settings.is_enabled}
                onChange={(e) => update('is_enabled', e.target.checked)}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              <span className="font-medium text-zinc-700">Mărime grup max</span>
              <input
                type="number"
                min="1"
                max="100"
                className="rounded-md border border-zinc-200 px-2 py-1 text-sm"
                value={settings.party_size_max}
                onChange={(e) =>
                  update(
                    'party_size_max',
                    Math.max(1, Math.min(100, Number(e.target.value) || 1)),
                  )
                }
              />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              <span className="font-medium text-zinc-700">Avans minim (minute)</span>
              <input
                type="number"
                min="0"
                max="10080"
                className="rounded-md border border-zinc-200 px-2 py-1 text-sm"
                value={settings.advance_min_minutes}
                onChange={(e) =>
                  update(
                    'advance_min_minutes',
                    Math.max(0, Math.floor(Number(e.target.value) || 0)),
                  )
                }
              />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              <span className="font-medium text-zinc-700">Avans maxim (zile)</span>
              <input
                type="number"
                min="0"
                max="365"
                className="rounded-md border border-zinc-200 px-2 py-1 text-sm"
                value={settings.advance_max_days}
                onChange={(e) =>
                  update(
                    'advance_max_days',
                    Math.max(0, Math.floor(Number(e.target.value) || 0)),
                  )
                }
              />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              <span className="font-medium text-zinc-700">Durată slot (minute)</span>
              <input
                type="number"
                min="15"
                max="480"
                className="rounded-md border border-zinc-200 px-2 py-1 text-sm"
                value={settings.slot_duration_min}
                onChange={(e) =>
                  update(
                    'slot_duration_min',
                    Math.max(15, Math.min(480, Number(e.target.value) || 15)),
                  )
                }
              />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              <span className="font-medium text-zinc-700">Capacitate per slot</span>
              <input
                type="number"
                min="1"
                max="1000"
                className="rounded-md border border-zinc-200 px-2 py-1 text-sm"
                value={settings.capacity_per_slot}
                onChange={(e) =>
                  update(
                    'capacity_per_slot',
                    Math.max(1, Math.floor(Number(e.target.value) || 1)),
                  )
                }
              />
            </label>
            <label className="flex flex-col gap-1 text-xs sm:col-span-2">
              <span className="font-medium text-zinc-700">Email notificare (opțional)</span>
              <input
                type="email"
                placeholder="rezervari@restaurant.ro"
                className="rounded-md border border-zinc-200 px-2 py-1 text-sm"
                value={settings.notify_email ?? ''}
                onChange={(e) => update('notify_email', e.target.value)}
              />
            </label>
          </div>
          <div className="mt-4 flex justify-end">
            <Button type="button" onClick={onSaveSettings} disabled={busy}>
              {busy ? 'Se salvează…' : 'Salvează'}
            </Button>
          </div>
        </div>
      )}

      {view === 'list' && (
        <>
          {/* Pending */}
          {pending.length > 0 && (
            <Section title={`Cereri (${pending.length})`}>
              <ResvList rows={pending} onConfirm={onConfirm} onReject={onReject} busy={busy} variant="pending" />
            </Section>
          )}

          {/* Upcoming */}
          {upcoming.length > 0 && (
            <Section title={`Confirmate (${upcoming.length})`}>
              <ResvList rows={upcoming} onCancel={onCancel} onNoShow={onNoShow} onCompleted={onCompleted} busy={busy} variant="upcoming" />
            </Section>
          )}

          {/* Past */}
          {past.length > 0 && (
            <Section title={`Istoric (${past.length})`}>
              <ResvList rows={past} busy={busy} variant="past" />
            </Section>
          )}

          {reservations.length === 0 && (
            <div className="rounded-md border border-dashed border-zinc-300 bg-white p-8 text-center text-sm text-zinc-500">
              Nu ai încă rezervări. Activează sistemul din setări pentru a primi.
            </div>
          )}
        </>
      )}

      {view === 'agenda' && (
        <AgendaView
          days={agendaDays}
          busy={busy}
          onConfirm={onConfirm}
          onReject={onReject}
          onCancel={onCancel}
          onNoShow={onNoShow}
          onCompleted={onCompleted}
        />
      )}
    </div>
  );
}

function AgendaView({
  days,
  busy,
  onConfirm,
  onReject,
  onCancel,
  onNoShow,
  onCompleted,
}: {
  days: Map<string, Reservation[]>;
  busy: boolean;
  onConfirm: (id: string) => void;
  onReject: (id: string) => void;
  onCancel: (id: string) => void;
  onNoShow: (id: string) => void;
  onCompleted: (id: string) => void;
}) {
  if (days.size === 0) {
    return (
      <div className="rounded-md border border-dashed border-zinc-300 bg-white p-8 text-center text-sm text-zinc-500">
        Nicio rezervare viitoare. Cele confirmate apar aici grupate pe zile, în ordinea orei.
      </div>
    );
  }
  // Map preserves insertion order which already matches ascending time —
  // the source array was sorted before grouping. So Array.from(days) keeps
  // chronological order.
  const dayEntries = Array.from(days.entries());
  return (
    <div className="flex flex-col gap-4">
      {dayEntries.map(([key, rows]) => {
        const headerIso = rows[0].requested_at;
        const totalGuests = rows.reduce((sum, r) => sum + r.party_size, 0);
        return (
          <section key={key} className="flex flex-col gap-2">
            <div className="sticky top-0 z-[1] flex items-baseline justify-between gap-3 bg-zinc-50/80 py-1 backdrop-blur-sm">
              <h2 className="text-sm font-semibold capitalize text-zinc-900">
                {formatDayHeader(headerIso)}
              </h2>
              <span className="text-xs text-zinc-500">
                {rows.length} rezervări · {totalGuests} persoane
              </span>
            </div>
            <ul className="flex flex-col gap-1.5">
              {rows.map((r) => (
                <li
                  key={r.id}
                  className="rounded-md border border-zinc-200 bg-white p-3 text-sm"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <div className="flex items-baseline gap-2">
                      <span className="text-base font-semibold tabular-nums text-zinc-900">
                        {formatTimeOnly(r.requested_at)}
                      </span>
                      <span className="font-medium text-zinc-900">
                        {r.customer_first_name}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${STATUS_PILL[r.status]}`}
                      >
                        {STATUS_LABEL[r.status]}
                      </span>
                    </div>
                    <span className="text-xs text-zinc-500 tabular-nums">
                      👥 {r.party_size}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-zinc-600">
                    <span>📞 {r.customer_phone}</span>
                    {r.customer_email && <span>✉ {r.customer_email}</span>}
                  </div>
                  {r.notes && (
                    <div className="mt-1 text-xs italic text-zinc-500">&ldquo;{r.notes}&rdquo;</div>
                  )}
                  {r.status === 'REQUESTED' && (
                    <div className="mt-2 flex gap-2">
                      <Button size="sm" disabled={busy} onClick={() => onConfirm(r.id)}>
                        Confirmă
                      </Button>
                      <Button size="sm" variant="outline" disabled={busy} onClick={() => onReject(r.id)}>
                        Respinge
                      </Button>
                    </div>
                  )}
                  {r.status === 'CONFIRMED' && (
                    <div className="mt-2 flex gap-2">
                      <Button size="sm" disabled={busy} onClick={() => onCompleted(r.id)}>
                        Onorată
                      </Button>
                      <Button size="sm" variant="outline" disabled={busy} onClick={() => onNoShow(r.id)}>
                        No-show
                      </Button>
                      <Button size="sm" variant="outline" disabled={busy} onClick={() => onCancel(r.id)}>
                        Anulează
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
        {title}
      </h2>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
}

function ResvList({
  rows,
  onConfirm,
  onReject,
  onCancel,
  onNoShow,
  onCompleted,
  busy,
  variant,
}: {
  rows: Reservation[];
  onConfirm?: (id: string) => void;
  onReject?: (id: string) => void;
  onCancel?: (id: string) => void;
  onNoShow?: (id: string) => void;
  onCompleted?: (id: string) => void;
  busy: boolean;
  variant: 'pending' | 'upcoming' | 'past';
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {rows.map((r) => (
        <div
          key={r.id}
          className="rounded-md border border-zinc-200 bg-white p-3 text-sm"
        >
          <div className="flex items-baseline justify-between gap-3">
            <div className="flex items-baseline gap-2">
              <span className="font-medium text-zinc-900">
                {r.customer_first_name}
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${STATUS_PILL[r.status]}`}
              >
                {STATUS_LABEL[r.status]}
              </span>
            </div>
            <span className="text-xs text-zinc-500">
              {formatRequestedAt(r.requested_at)}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-zinc-600">
            <span>👥 {r.party_size}</span>
            <span>📞 {r.customer_phone}</span>
            {r.customer_email && <span>✉ {r.customer_email}</span>}
          </div>
          {r.notes && (
            <div className="mt-1 text-xs italic text-zinc-500">&ldquo;{r.notes}&rdquo;</div>
          )}
          {r.rejection_reason && (
            <div className="mt-1 text-xs text-rose-700">
              Respinsă: {r.rejection_reason}
            </div>
          )}
          {variant === 'pending' && onConfirm && onReject && (
            <div className="mt-2 flex gap-2">
              <Button size="sm" disabled={busy} onClick={() => onConfirm(r.id)}>
                Confirmă
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => onReject(r.id)}
              >
                Respinge
              </Button>
            </div>
          )}
          {variant === 'upcoming' && (
            <div className="mt-2 flex gap-2">
              {onCompleted && (
                <Button size="sm" disabled={busy} onClick={() => onCompleted(r.id)}>
                  Onorată
                </Button>
              )}
              {onNoShow && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => onNoShow(r.id)}
                >
                  No-show
                </Button>
              )}
              {onCancel && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => onCancel(r.id)}
                >
                  Anulează
                </Button>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
