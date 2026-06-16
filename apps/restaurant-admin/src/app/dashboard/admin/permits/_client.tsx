'use client';

// Stream 7 — admin permits review queue (client island).
//
// Mirrors verifications/_client.tsx layout — same filter pills (PENDING /
// VERIFIED / REJECTED / EXPIRED / ALL), same decision controls (Approve /
// Reject with reason). Adds a bulk-approve action that operates over the
// currently visible PENDING permits.

import { useMemo, useState, useTransition } from 'react';
import {
  bulkApproveCourierPermits,
  verifyCourierPermit,
  type PermitDecision,
} from './actions';

export type PermitStatus = 'PENDING' | 'VERIFIED' | 'REJECTED' | 'EXPIRED';

export type PermitVM = {
  userId: string;
  fullName: string | null;
  city: string | null;
  vehicleType: string | null;
  fleetName: string | null;
  fleetPrefix: string | null;
  countryIso: string | null;
  validUntil: string | null;
  docUrl: string | null;
  status: PermitStatus;
  verifiedAt: string | null;
  updatedAt: string | null;
};

type Filter = 'PENDING' | 'VERIFIED' | 'REJECTED' | 'EXPIRED' | 'ALL';

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleString('ro-RO', { dateStyle: 'medium', timeStyle: 'short' });
}

function fmtDay(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString('ro-RO', { dateStyle: 'medium' });
}

function courierDisplay(prefix: string | null, name: string | null): string {
  const n = (name ?? '').trim() || 'Curier';
  const p = (prefix ?? '').trim();
  return p ? `${p} ${n}` : n;
}

function StatusBadge({ status }: { status: PermitStatus }) {
  const config: Record<PermitStatus, { label: string; cls: string }> = {
    PENDING: { label: 'În așteptare', cls: 'bg-amber-500/20 text-amber-300' },
    VERIFIED: { label: 'Verificat', cls: 'bg-emerald-500/20 text-emerald-300' },
    REJECTED: { label: 'Respins', cls: 'bg-rose-500/20 text-rose-300' },
    EXPIRED: { label: 'Expirat', cls: 'bg-slate-500/20 text-slate-300' },
  };
  const c = config[status];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${c.cls}`}
    >
      {c.label}
    </span>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <p className="rounded-xl border border-dashed border-slate-800 bg-slate-900/40 px-4 py-6 text-center text-sm text-slate-500">
      {label}
    </p>
  );
}

function DocLink({ url }: { url: string | null }) {
  if (!url) {
    return (
      <span className="inline-flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-900/40 px-2.5 py-1 text-[11px] text-slate-500">
        Scan permis: lipsă
      </span>
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1 text-[11px] font-medium text-violet-300 hover:bg-slate-800"
    >
      Scan permis ↗
    </a>
  );
}

function DecisionControls({
  onDecide,
}: {
  onDecide: (
    decision: PermitDecision,
    reason?: string,
  ) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');

  function approve() {
    setError(null);
    start(async () => {
      const r = await onDecide('VERIFIED');
      if (!r.ok) setError(r.error ?? 'Eroare.');
    });
  }

  function confirmReject() {
    setError(null);
    if (!reason.trim()) {
      setError('Adaugă motivul respingerii.');
      return;
    }
    start(async () => {
      const r = await onDecide('REJECTED', reason.trim());
      if (!r.ok) setError(r.error ?? 'Eroare.');
    });
  }

  if (rejecting) {
    return (
      <div className="flex flex-col gap-2">
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          placeholder="Motivul respingerii (vizibil curierului)…"
          className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-rose-500 focus:outline-none"
        />
        <div className="flex gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={confirmReject}
            className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-500 disabled:opacity-50"
          >
            {pending ? 'Se respinge…' : 'Confirmă respingerea'}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => setRejecting(false)}
            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
          >
            Anulează
          </button>
        </div>
        {error ? <p className="text-xs text-rose-400">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={approve}
        className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
      >
        {pending ? 'Se aprobă…' : 'Aprobă'}
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => setRejecting(true)}
        className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-50"
      >
        Respinge
      </button>
      {error ? <p className="text-xs text-rose-400">{error}</p> : null}
    </div>
  );
}

function PermitCard({
  permit,
  onDone,
}: {
  permit: PermitVM;
  onDone: (d: PermitDecision) => void;
}) {
  return (
    <article className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-slate-100">
            {courierDisplay(permit.fleetPrefix, permit.fullName)}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            {permit.fleetName ? `${permit.fleetName} · ` : ''}
            {permit.city ?? 'oraș nespecificat'}
            {permit.vehicleType ? ` · ${permit.vehicleType}` : ''}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            Țară: <span className="text-slate-300">{permit.countryIso ?? '—'}</span>
            {' · '}
            Valabil până la{' '}
            <span className="text-slate-300">{fmtDay(permit.validUntil)}</span>
          </p>
        </div>
        <StatusBadge status={permit.status} />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <DocLink url={permit.docUrl} />
      </div>

      <p className="mt-2 text-[11px] text-slate-600">
        Trimis / actualizat: {fmtDate(permit.updatedAt)}
        {permit.verifiedAt
          ? ` · Decizie: ${fmtDate(permit.verifiedAt)}`
          : ''}
      </p>

      {permit.status === 'PENDING' ? (
        <div className="mt-3">
          <DecisionControls
            onDecide={async (decision, reason) => {
              const r = await verifyCourierPermit(permit.userId, decision, reason);
              if (r.ok) onDone(decision);
              return r.ok ? { ok: true } : { ok: false, error: r.error };
            }}
          />
        </div>
      ) : null}
    </article>
  );
}

export function PermitsClient({ permits }: { permits: PermitVM[] }) {
  const [done, setDone] = useState<Record<string, PermitDecision>>({});
  const [filter, setFilter] = useState<Filter>('PENDING');
  const [bulkPending, startBulk] = useTransition();
  const [bulkMsg, setBulkMsg] = useState<string | null>(null);

  function match(status: PermitStatus): boolean {
    if (filter === 'ALL') return true;
    return status === filter;
  }

  const visible = permits.filter((p) => !done[p.userId] && match(p.status));

  const counts = useMemo(
    () => ({
      PENDING: permits.filter((p) => p.status === 'PENDING').length,
      VERIFIED: permits.filter((p) => p.status === 'VERIFIED').length,
      REJECTED: permits.filter((p) => p.status === 'REJECTED').length,
      EXPIRED: permits.filter((p) => p.status === 'EXPIRED').length,
      ALL: permits.length,
    }),
    [permits],
  );

  const visiblePendingIds = useMemo(
    () =>
      visible
        .filter((p) => p.status === 'PENDING')
        .map((p) => p.userId),
    [visible],
  );

  function runBulkApprove() {
    setBulkMsg(null);
    startBulk(async () => {
      const r = await bulkApproveCourierPermits(visiblePendingIds);
      const next = { ...done };
      // Optimistically mark approved ones as done in the local map.
      visiblePendingIds.forEach((id) => {
        if (!r.failed.find((f) => f.userId === id)) {
          next[id] = 'VERIFIED';
        }
      });
      setDone(next);
      if (r.failed.length > 0) {
        setBulkMsg(
          `Aprobate ${r.approved} · Eșuat ${r.failed.length}: ${r.failed
            .slice(0, 3)
            .map((f) => f.error)
            .join(', ')}${r.failed.length > 3 ? '…' : ''}`,
        );
      } else {
        setBulkMsg(`Aprobate ${r.approved} permise.`);
      }
    });
  }

  const labels: Record<Filter, string> = {
    PENDING: `În așteptare (${counts.PENDING})`,
    VERIFIED: `Verificate (${counts.VERIFIED})`,
    REJECTED: `Respinse (${counts.REJECTED})`,
    EXPIRED: `Expirate (${counts.EXPIRED})`,
    ALL: `Toate (${counts.ALL})`,
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2">
        {(['PENDING', 'VERIFIED', 'REJECTED', 'EXPIRED', 'ALL'] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
              filter === f
                ? 'bg-violet-600 text-white'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            {labels[f]}
          </button>
        ))}
      </div>

      {visiblePendingIds.length > 0 ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-3">
          <p className="text-xs text-slate-400">
            {visiblePendingIds.length} permise PENDING vizibile pot fi aprobate în bloc.
            Bulk approve aprobă fiecare individual (audit trail per curier).
          </p>
          <button
            type="button"
            disabled={bulkPending}
            onClick={runBulkApprove}
            className="ml-auto rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            {bulkPending ? 'Se aprobă în bloc…' : 'Aprobă în bloc'}
          </button>
          {bulkMsg ? (
            <p className="basis-full text-xs text-slate-300">{bulkMsg}</p>
          ) : null}
        </div>
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-300">
          Curieri non-UE · {visible.length}
        </h2>
        {visible.length === 0 ? (
          <EmptyState label="Niciun curier în această categorie." />
        ) : (
          visible.map((p) => (
            <PermitCard
              key={p.userId}
              permit={p}
              onDone={(d) => setDone((m) => ({ ...m, [p.userId]: d }))}
            />
          ))
        )}
      </section>
    </div>
  );
}
