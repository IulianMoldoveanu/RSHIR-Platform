'use client';

// Lane AGGREGATOR-EMAIL-INTAKE — PR 3 of 3.
// Inbox list + manual-apply action for parsed-but-not-auto-applied jobs.

import { useState, useTransition } from 'react';
import { applyParsedJob } from '../../settings/aggregator-intake/actions';

type Job = {
  id: string;
  sender: string | null;
  subject: string | null;
  received_at: string;
  status: string;
  detected_source: string | null;
  parsed_data: Record<string, unknown> | null;
  applied_order_id: string | null;
  error_text: string | null;
};

type Props = {
  tenantId: string;
  canEdit: boolean;
  jobs: Job[];
};

const STATUS_PILL: Record<string, { label: string; cls: string }> = {
  RECEIVED: { label: 'Primit', cls: 'bg-zinc-100 text-zinc-700' },
  PARSING: { label: 'Se parsează', cls: 'bg-blue-100 text-blue-700' },
  PARSED: { label: 'Parsat', cls: 'bg-amber-100 text-amber-800' },
  APPLIED: { label: 'Aplicat', cls: 'bg-emerald-100 text-emerald-800' },
  FAILED: { label: 'Eșuat', cls: 'bg-rose-100 text-rose-800' },
  SKIPPED: { label: 'Ignorat', cls: 'bg-zinc-100 text-zinc-500' },
};

// Lane EMAIL-REGEX-WIREUP — pill for the parser strategy. Reads from
// parsed_data.parsed_strategy. Older jobs (before this PR) won't carry
// the field and fall through to the "—" pill.
const STRATEGY_PILL: Record<string, { label: string; cls: string }> = {
  regex: { label: 'Regex', cls: 'bg-emerald-100 text-emerald-800' },
  'regex+ai-fill': { label: 'Regex + AI', cls: 'bg-amber-100 text-amber-800' },
  'ai-full': { label: 'AI complet', cls: 'bg-orange-100 text-orange-800' },
  failed: { label: 'Eșuat', cls: 'bg-rose-100 text-rose-800' },
};

function getStrategy(parsedData: Record<string, unknown> | null): string | null {
  const v = parsedData?.['parsed_strategy'];
  return typeof v === 'string' ? v : null;
}

export function InboxClient({ tenantId, canEdit, jobs }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (jobs.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-200 bg-white p-8 text-center">
        <p className="text-sm font-medium text-zinc-900">Niciun email primit încă.</p>
        <p className="mt-1 text-xs text-zinc-500">
          După ce setați redirectul din inbox-ul restaurantului, primele emailuri apar aici în
          cel mult 1-2 minute.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white shadow-sm">
      <ul className="divide-y divide-zinc-100">
        {jobs.map((j) => {
          const pill = STATUS_PILL[j.status] ?? STATUS_PILL.RECEIVED;
          const strategy = getStrategy(j.parsed_data);
          const stratPill = strategy ? STRATEGY_PILL[strategy] : null;
          const open = openId === j.id;
          return (
            <li key={j.id} className="px-4 py-3">
              <button
                type="button"
                onClick={() => setOpenId(open ? null : j.id)}
                className="flex w-full items-center gap-3 text-left"
              >
                <span
                  className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-medium ${pill.cls}`}
                >
                  {pill.label}
                </span>
                {stratPill ? (
                  <span
                    title="Strategia de parsare folosită"
                    className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-medium ${stratPill.cls}`}
                  >
                    {stratPill.label}
                  </span>
                ) : (
                  <span className="shrink-0 rounded-md bg-zinc-50 px-2 py-0.5 text-[11px] font-medium text-zinc-400">
                    —
                  </span>
                )}
                <span className="shrink-0 text-xs text-zinc-500">
                  {new Date(j.received_at).toLocaleString('ro-RO')}
                </span>
                <span className="shrink-0 text-xs font-medium text-zinc-700">
                  {j.detected_source ?? '—'}
                </span>
                <span className="flex-1 truncate text-sm text-zinc-900">
                  {j.subject || '(fără subiect)'}
                </span>
                <span className="shrink-0 text-xs text-zinc-500">{j.sender ?? ''}</span>
              </button>

              {open && (
                <div className="mt-3 rounded-md border border-zinc-200 bg-zinc-50 p-3 text-xs">
                  {j.error_text && (
                    <p className="mb-2 rounded bg-rose-50 px-2 py-1.5 text-rose-800">
                      {j.error_text}
                    </p>
                  )}
                  {j.parsed_data ? (
                    <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] text-zinc-800">
                      {JSON.stringify(j.parsed_data, null, 2)}
                    </pre>
                  ) : (
                    <p className="text-zinc-500">
                      Datele parsate nu sunt disponibile încă.
                    </p>
                  )}

                  <div className="mt-3 flex items-center justify-end gap-2">
                    {j.applied_order_id && (
                      <a
                        href={`/dashboard/orders/${j.applied_order_id}`}
                        className="inline-flex items-center rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                      >
                        Deschide comanda
                      </a>
                    )}
                    {canEdit && j.status === 'PARSED' && !j.applied_order_id && (
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => {
                          setActionError(null);
                          startTransition(async () => {
                            const r = await applyParsedJob(tenantId, j.id);
                            if (!r.ok) setActionError(r.error);
                          });
                        }}
                        className="inline-flex items-center rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
                      >
                        {isPending ? '...' : 'Aplică în comenzi'}
                      </button>
                    )}
                  </div>

                  {actionError && (
                    <p className="mt-2 rounded bg-rose-50 px-2 py-1.5 text-rose-800">
                      {actionError}
                    </p>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
