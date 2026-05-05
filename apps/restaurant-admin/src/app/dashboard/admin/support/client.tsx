'use client';

import { useState, useTransition } from 'react';
import { updateSupportMessage } from './actions';

type SupportRow = {
  id: string;
  tenant_id: string | null;
  email: string | null;
  category: string | null;
  message: string;
  status: string;
  admin_note: string | null;
  ip: string | null;
  user_agent: string | null;
  created_at: string;
  resolved_at: string | null;
};

const CATEGORY_LABELS: Record<string, string> = {
  ORDER: 'Comandă',
  PAYMENT: 'Plată',
  ACCOUNT: 'Cont',
  OTHER: 'Altceva',
};

export function SupportInboxClient({ rows }: { rows: SupportRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-[#E2E8F0] bg-white p-10 text-center">
        <p className="text-sm font-medium">Niciun mesaj în această stare.</p>
        <p className="mt-1 text-xs text-[#94a3b8]">Schimbați tab-ul pentru a vedea alte mesaje.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <SupportCard key={row.id} row={row} />
      ))}
    </div>
  );
}

function SupportCard({ row }: { row: SupportRow }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState(row.admin_note ?? '');
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  function applyStatus(status: 'IN_PROGRESS' | 'RESOLVED' | 'SPAM' | 'NEW') {
    setError(null);
    startTransition(async () => {
      const r = await updateSupportMessage({
        id: row.id,
        status,
        admin_note: note || undefined,
      });
      if (!r.ok) setError(r.error);
      else setDone(`Status: ${status}`);
    });
  }

  const mailto = row.email
    ? `mailto:${encodeURIComponent(row.email)}?subject=${encodeURIComponent(
        `Re: Suport HIR — ${CATEGORY_LABELS[row.category ?? 'OTHER'] ?? 'Suport'}`,
      )}&body=${encodeURIComponent(`Bună ziua,\n\n--- Mesajul dumneavoastră ---\n${row.message}\n\n--- Răspunsul nostru ---\n`)}`
    : null;

  return (
    <article
      className={`overflow-hidden rounded-lg border bg-white ${
        done ? 'border-[#A7F3D0]' : 'border-[#E2E8F0]'
      }`}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-start justify-between gap-4 px-5 py-4 text-left hover:bg-[#F8FAFC]"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="rounded bg-[#F1F5F9] px-1.5 py-0.5 text-xs font-medium text-[#475569]">
              {CATEGORY_LABELS[row.category ?? 'OTHER'] ?? row.category ?? 'Altceva'}
            </span>
            <span className="truncate text-sm font-medium text-[#0F172A]">
              {row.email ?? '(fără email)'}
            </span>
          </div>
          <p className="mt-2 line-clamp-2 text-sm text-[#475569]">{row.message}</p>
          <p className="mt-1 text-xs text-[#94a3b8]">
            {new Date(row.created_at).toLocaleString('ro-RO')}
            {row.resolved_at ? ` · rezolvat: ${new Date(row.resolved_at).toLocaleDateString('ro-RO')}` : null}
          </p>
        </div>
        <span className="shrink-0 text-xs text-[#94a3b8]">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="border-t border-[#E2E8F0] bg-[#FAFAFA] px-5 py-4">
          <div className="mb-3">
            <p className="text-xs font-medium text-[#0F172A]">Mesaj integral</p>
            <p className="mt-1 whitespace-pre-wrap rounded-md border border-[#E2E8F0] bg-white p-3 text-sm text-[#0F172A]">
              {row.message}
            </p>
          </div>

          <div className="mb-3 grid grid-cols-2 gap-2 text-xs text-[#475569]">
            <div>
              <span className="font-medium">Tenant ID:</span>{' '}
              <span className="font-mono">{row.tenant_id ?? '—'}</span>
            </div>
            <div>
              <span className="font-medium">IP:</span>{' '}
              <span className="font-mono">{row.ip ?? '—'}</span>
            </div>
            <div className="col-span-2 truncate">
              <span className="font-medium">User agent:</span>{' '}
              <span className="font-mono text-[#94a3b8]">{row.user_agent ?? '—'}</span>
            </div>
          </div>

          <label htmlFor={`note-${row.id}`} className="block text-xs font-medium text-[#0F172A]">
            Notă internă
          </label>
          <textarea
            id={`note-${row.id}`}
            rows={2}
            maxLength={2000}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Notă pentru echipă (opțional)"
            className="mt-1 w-full resize-none rounded-md border border-[#E2E8F0] bg-white px-3 py-2 text-sm focus:border-[#7c3aed] focus:outline-none focus:ring-1 focus:ring-[#7c3aed]"
          />

          {error && (
            <p role="alert" className="mt-2 rounded-md bg-[#FEF2F2] px-3 py-2 text-xs text-[#B91C1C]">
              {error}
            </p>
          )}
          {done && (
            <p className="mt-2 rounded-md bg-[#DCFCE7] px-3 py-2 text-xs text-[#15803D]">{done}</p>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            {row.status !== 'IN_PROGRESS' && (
              <button
                type="button"
                disabled={pending}
                onClick={() => applyStatus('IN_PROGRESS')}
                className="rounded-md border border-[#E2E8F0] bg-white px-3 py-1.5 text-xs font-medium text-[#0F172A] hover:bg-[#F1F5F9] disabled:opacity-60"
              >
                Marchează în lucru
              </button>
            )}
            {row.status !== 'RESOLVED' && (
              <button
                type="button"
                disabled={pending}
                onClick={() => applyStatus('RESOLVED')}
                className="rounded-md bg-[#16A34A] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#15803D] disabled:opacity-60"
              >
                Rezolvat
              </button>
            )}
            {row.status !== 'SPAM' && (
              <button
                type="button"
                disabled={pending}
                onClick={() => applyStatus('SPAM')}
                className="rounded-md border border-[#FECACA] bg-white px-3 py-1.5 text-xs font-medium text-[#B91C1C] hover:bg-[#FEF2F2] disabled:opacity-60"
              >
                Spam
              </button>
            )}
            {row.status !== 'NEW' && (
              <button
                type="button"
                disabled={pending}
                onClick={() => applyStatus('NEW')}
                className="rounded-md border border-[#E2E8F0] bg-white px-3 py-1.5 text-xs font-medium text-[#475569] hover:bg-[#F1F5F9] disabled:opacity-60"
              >
                Repune ca NEW
              </button>
            )}
            {mailto && (
              <a
                href={mailto}
                className="ml-auto rounded-md border border-[#7c3aed] bg-white px-3 py-1.5 text-xs font-medium text-[#7c3aed] hover:bg-[#F5F3FF]"
              >
                Răspunde prin email
              </a>
            )}
          </div>
        </div>
      )}
    </article>
  );
}
