'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Loader2, X } from 'lucide-react';
import { decideDeletionAction, setFleetCanApproveDeletionsAction } from './actions';

export type DeletionRow = {
  id: string;
  courier_name: string | null;
  email: string;
  fleet_name: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'COMPLETED';
  requested_at: string;
  scheduled_purge_at: string | null;
};

const STATUS_STYLE: Record<string, string> = {
  PENDING: 'bg-amber-500/10 text-amber-300',
  APPROVED: 'bg-violet-500/10 text-violet-300',
  REJECTED: 'bg-hir-border text-hir-muted-fg',
  COMPLETED: 'bg-emerald-500/10 text-emerald-300',
};
const STATUS_LABEL: Record<string, string> = {
  PENDING: 'În așteptare',
  APPROVED: 'Aprobată',
  REJECTED: 'Respinsă',
  COMPLETED: 'Finalizată',
};

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('ro-RO', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function DeletionRequestsList({
  rows,
  canDecide,
}: {
  rows: DeletionRow[];
  canDecide: boolean;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-hir-border bg-hir-surface px-6 py-12 text-center">
        <p className="text-sm text-hir-muted-fg">Nicio cerere de ștergere.</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {rows.map((r) => (
        <DeletionCard key={r.id} row={r} canDecide={canDecide} />
      ))}
    </div>
  );
}

function DeletionCard({ row, canDecide }: { row: DeletionRow; canDecide: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState('');

  function decide(decision: 'APPROVE' | 'REJECT') {
    setError(null);
    const fd = new FormData();
    fd.set('id', row.id);
    fd.set('decision', decision);
    if (note) fd.set('note', note);
    start(async () => {
      const r = await decideDeletionAction(fd);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="rounded-xl border border-hir-border bg-hir-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-hir-fg">{row.courier_name ?? 'Curier'}</p>
          <p className="truncate text-xs text-hir-muted-fg">{row.email}</p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
            STATUS_STYLE[row.status] ?? 'bg-hir-border text-hir-muted-fg'
          }`}
        >
          {STATUS_LABEL[row.status] ?? row.status}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-hir-muted-fg">
        {row.fleet_name ? <span>{row.fleet_name}</span> : null}
        <span>Solicitat: {fmtDate(row.requested_at)}</span>
        {row.status === 'APPROVED' ? (
          <span className="text-amber-300">Ștergere programată: {fmtDate(row.scheduled_purge_at)}</span>
        ) : null}
      </div>

      {canDecide && row.status === 'PENDING' ? (
        <div className="mt-3 flex flex-col gap-2">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={200}
            placeholder="Motiv (opțional)"
            className="rounded-md border border-hir-border bg-hir-surface px-3 py-2 text-xs text-hir-fg focus:border-violet-500 focus:outline-none"
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => decide('APPROVE')}
              disabled={pending}
              className="inline-flex items-center gap-1 rounded-md border border-violet-600/40 px-3 py-1.5 text-xs font-medium text-violet-300 hover:bg-violet-600/10 disabled:opacity-50"
            >
              <Check className="h-3.5 w-3.5" aria-hidden />
              Aprobă ștergerea (păstrare 30 zile)
            </button>
            <button
              type="button"
              onClick={() => decide('REJECT')}
              disabled={pending}
              className="inline-flex items-center gap-1 rounded-md border border-hir-border px-3 py-1.5 text-xs font-medium text-hir-muted-fg hover:bg-hir-border disabled:opacity-50"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
              Respinge + restaurează
            </button>
            {pending ? <Loader2 className="h-4 w-4 animate-spin text-hir-muted-fg" aria-hidden /> : null}
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="mt-2 rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
          {error}
        </p>
      ) : null}
    </div>
  );
}

// ── Platform-admin: grant/revoke fleet-manager approval permission ───────────
export function FleetApprovalPermissions({
  fleets,
}: {
  fleets: { id: string; name: string; can_approve_deletions: boolean }[];
}) {
  if (fleets.length === 0) return null;
  return (
    <div className="overflow-hidden rounded-xl border border-hir-border bg-hir-surface">
      <ul className="divide-y divide-hir-border">
        {fleets.map((f) => (
          <PermissionRow key={f.id} fleet={f} />
        ))}
      </ul>
    </div>
  );
}

function PermissionRow({
  fleet,
}: {
  fleet: { id: string; name: string; can_approve_deletions: boolean };
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function toggle() {
    const fd = new FormData();
    fd.set('fleet_id', fleet.id);
    fd.set('enabled', String(!fleet.can_approve_deletions));
    start(async () => {
      await setFleetCanApproveDeletionsAction(fd);
      router.refresh();
    });
  }

  return (
    <li className="flex items-center justify-between gap-3 px-4 py-3">
      <span className="text-sm text-hir-fg">{fleet.name}</span>
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        aria-pressed={fleet.can_approve_deletions}
        className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition disabled:opacity-50 ${
          fleet.can_approve_deletions
            ? 'bg-emerald-900/60 text-emerald-300 hover:bg-emerald-900/80'
            : 'bg-hir-border text-hir-muted-fg hover:bg-hir-border/70'
        }`}
      >
        {pending ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : null}
        {fleet.can_approve_deletions ? 'Poate aproba' : 'Blocat'}
      </button>
    </li>
  );
}
