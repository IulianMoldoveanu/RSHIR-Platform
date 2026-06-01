'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Bug, Lightbulb, Loader2 } from 'lucide-react';
import { updateFeedbackStatusAction } from '@/app/admin/feedback/actions';

export type FeedbackRow = {
  id: string;
  kind: 'SUGGESTION' | 'BUG';
  message: string;
  status: 'NEW' | 'TRIAGED' | 'RESOLVED' | 'DISMISSED';
  platform: string | null;
  created_at: string;
  courier_name: string | null;
  fleet_name: string | null;
};

const STATUS_STYLE: Record<string, string> = {
  NEW: 'bg-violet-900/60 text-violet-300',
  TRIAGED: 'bg-amber-900/60 text-amber-300',
  RESOLVED: 'bg-emerald-900/60 text-emerald-300',
  DISMISSED: 'bg-hir-border text-hir-muted-fg',
};
const STATUS_LABEL: Record<string, string> = {
  NEW: 'Nou',
  TRIAGED: 'În lucru',
  RESOLVED: 'Rezolvat',
  DISMISSED: 'Respins',
};

export function FeedbackList({
  rows,
  showFleet = false,
}: {
  rows: FeedbackRow[];
  showFleet?: boolean;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-hir-border bg-hir-surface px-6 py-12 text-center">
        <p className="text-sm text-hir-muted-fg">Niciun mesaj de la curieri încă.</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {rows.map((r) => (
        <FeedbackCard key={r.id} row={r} showFleet={showFleet} />
      ))}
    </div>
  );
}

function FeedbackCard({ row, showFleet }: { row: FeedbackRow; showFleet: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function setStatus(status: string) {
    setError(null);
    const fd = new FormData();
    fd.set('id', row.id);
    fd.set('status', status);
    start(async () => {
      const r = await updateFeedbackStatusAction(fd);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.refresh();
    });
  }

  const isBug = row.kind === 'BUG';
  const closed = row.status === 'RESOLVED' || row.status === 'DISMISSED';

  return (
    <div className="rounded-xl border border-hir-border bg-hir-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
              isBug ? 'bg-rose-900/60 text-rose-300' : 'bg-violet-900/60 text-violet-300'
            }`}
          >
            {isBug ? (
              <Bug className="h-3 w-3" aria-hidden />
            ) : (
              <Lightbulb className="h-3 w-3" aria-hidden />
            )}
            {isBug ? 'Problemă' : 'Sugestie'}
          </span>
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
              STATUS_STYLE[row.status] ?? 'bg-hir-border text-hir-muted-fg'
            }`}
          >
            {STATUS_LABEL[row.status] ?? row.status}
          </span>
        </div>
        <time className="shrink-0 text-xs text-hir-muted-fg">
          {new Date(row.created_at).toLocaleDateString('ro-RO')}
        </time>
      </div>

      <p className="mt-2 whitespace-pre-wrap text-sm text-hir-fg">{row.message}</p>

      <div className="mt-2 flex flex-wrap items-center gap-x-2 text-xs text-hir-muted-fg">
        <span>{row.courier_name ?? 'Curier'}</span>
        {showFleet && row.fleet_name ? <span>· {row.fleet_name}</span> : null}
        {row.platform ? <span>· {row.platform}</span> : null}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {row.status === 'NEW' ? (
          <ActionButton onClick={() => setStatus('TRIAGED')} disabled={pending}>
            Preia
          </ActionButton>
        ) : null}
        {!closed ? (
          <>
            <ActionButton onClick={() => setStatus('RESOLVED')} disabled={pending} tone="emerald">
              Rezolvă
            </ActionButton>
            <ActionButton onClick={() => setStatus('DISMISSED')} disabled={pending} tone="muted">
              Respinge
            </ActionButton>
          </>
        ) : (
          <ActionButton onClick={() => setStatus('NEW')} disabled={pending} tone="muted">
            Redeschide
          </ActionButton>
        )}
        {pending ? <Loader2 className="h-4 w-4 animate-spin text-hir-muted-fg" aria-hidden /> : null}
      </div>

      {error ? (
        <p className="mt-2 rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function ActionButton({
  onClick,
  disabled,
  tone = 'violet',
  children,
}: {
  onClick: () => void;
  disabled: boolean;
  tone?: 'violet' | 'emerald' | 'muted';
  children: React.ReactNode;
}) {
  const toneClass =
    tone === 'emerald'
      ? 'border-emerald-600/40 text-emerald-300 hover:bg-emerald-600/10'
      : tone === 'muted'
        ? 'border-hir-border text-hir-muted-fg hover:bg-hir-border'
        : 'border-violet-600/40 text-violet-300 hover:bg-violet-600/10';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-md border px-3 py-1.5 text-xs font-medium transition disabled:opacity-50 ${toneClass}`}
    >
      {children}
    </button>
  );
}
