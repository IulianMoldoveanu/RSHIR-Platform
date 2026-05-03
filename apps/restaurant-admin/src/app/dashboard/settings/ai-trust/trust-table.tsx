'use client';

import { useState, useTransition } from 'react';
import { toast } from '@hir/ui';
import { setAgentTrustLevel } from './actions';

type TrustLevel = 'PROPOSE_ONLY' | 'AUTO_REVERSIBLE' | 'AUTO_FULL';

type Entry = {
  agent: string;
  agentLabel: string;
  category: string;
  label: string;
  description: string;
  isDestructive: boolean;
  trustLevel: TrustLevel;
  approvalCount: number;
  rejectionCount: number;
};

const LABELS: Record<TrustLevel, string> = {
  PROPOSE_ONLY: 'Doar propune',
  AUTO_REVERSIBLE: 'Automat (cu revert)',
  AUTO_FULL: 'Automat complet',
};

export function TrustTable({
  canEdit,
  tenantId,
  entries,
}: {
  canEdit: boolean;
  tenantId: string;
  entries: Entry[];
}) {
  // Group by agent on render. We re-derive on each call rather than memo
  // because the list is tiny (<50 rows) and entries change on revalidate.
  const grouped = new Map<string, Entry[]>();
  for (const e of entries) {
    const arr = grouped.get(e.agentLabel) ?? [];
    arr.push(e);
    grouped.set(e.agentLabel, arr);
  }

  return (
    <div className="flex flex-col gap-6">
      {Array.from(grouped.entries()).map(([agentLabel, group]) => (
        <section
          key={agentLabel}
          className="rounded-lg border border-zinc-200 bg-white"
        >
          <h2 className="border-b border-zinc-200 px-4 py-3 text-sm font-medium text-zinc-900">
            {agentLabel}
          </h2>
          <ul className="divide-y divide-zinc-100">
            {group.map((entry) => (
              <TrustRow
                key={`${entry.agent}::${entry.category}`}
                entry={entry}
                canEdit={canEdit}
                tenantId={tenantId}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function TrustRow({
  entry,
  canEdit,
  tenantId,
}: {
  entry: Entry;
  canEdit: boolean;
  tenantId: string;
}) {
  const [level, setLevel] = useState<TrustLevel>(entry.trustLevel);
  const [pending, start] = useTransition();

  const disabled = !canEdit || pending;
  // Destructive categories are capped at PROPOSE_ONLY by policy. The
  // server enforces this too (see updateTrustLevel).
  const lockedAtProposeOnly = entry.isDestructive;

  function onChange(next: TrustLevel) {
    if (lockedAtProposeOnly && next !== 'PROPOSE_ONLY') return;
    const previous = level;
    setLevel(next);
    start(async () => {
      const res = await setAgentTrustLevel(tenantId, {
        agentName: entry.agent,
        actionCategory: entry.category,
        trustLevel: next,
      });
      if (!res.ok) {
        setLevel(previous);
        toast.error('Salvare eșuată. Încercați din nou.');
        return;
      }
      toast.success('Nivel actualizat.');
    });
  }

  return (
    <li className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-zinc-900">{entry.label}</span>
          {entry.isDestructive && (
            <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-rose-700">
              destructiv
            </span>
          )}
        </div>
        <p className="text-xs text-zinc-500">{entry.description}</p>
        {(entry.approvalCount > 0 || entry.rejectionCount > 0) && (
          <p className="text-[11px] text-zinc-400">
            {entry.approvalCount} aprobate · {entry.rejectionCount} respinse
          </p>
        )}
      </div>
      <div className="flex flex-none items-center gap-2">
        <select
          aria-label={`Nivel încredere pentru ${entry.label}`}
          className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 disabled:cursor-not-allowed disabled:bg-zinc-50 disabled:text-zinc-400"
          value={level}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value as TrustLevel)}
        >
          <option value="PROPOSE_ONLY">{LABELS.PROPOSE_ONLY}</option>
          <option
            value="AUTO_REVERSIBLE"
            disabled={lockedAtProposeOnly}
          >
            {LABELS.AUTO_REVERSIBLE}
          </option>
          <option value="AUTO_FULL" disabled={lockedAtProposeOnly}>
            {LABELS.AUTO_FULL}
          </option>
        </select>
      </div>
    </li>
  );
}
