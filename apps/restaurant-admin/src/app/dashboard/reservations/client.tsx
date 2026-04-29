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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="text-xs text-zinc-500">
          {pending.length} cereri · {upcoming.length} viitoare ·{' '}
          {past.length} istoric
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
