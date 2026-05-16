'use client';

import { useEffect, useId, useState } from 'react';
import { FileWarning } from 'lucide-react';
import {
  EMPTY_DOCS,
  classifyExpiry,
  formatRoDate,
  readDocs,
  writeDocs,
  type CourierDocs,
  type ExpiryState,
} from '@/lib/courier-documents';

type DocKey = keyof CourierDocs;

const DOC_LABELS: Record<DocKey, { label: string; required: boolean }> = {
  dl: { label: 'Permis de conducere', required: true },
  vehicleReg: { label: 'Carte de identitate vehicul', required: true },
  rca: { label: 'RCA (asigurare obligatorie)', required: true },
  casco: { label: 'CASCO (opțional)', required: false },
};

const CHIP_STYLE: Record<ExpiryState, { className: string; label: (d: number | null) => string }> = {
  unset: {
    className: 'bg-hir-border text-hir-muted-fg',
    label: () => 'Necompletat',
  },
  expired: {
    className: 'bg-rose-500/15 text-rose-300',
    label: (d) => (d !== null ? `Expirat acum ${Math.abs(d)} zile` : 'Expirat'),
  },
  critical: {
    className: 'bg-rose-500/15 text-rose-300',
    label: (d) => (d === 0 ? 'Expiră azi' : `Mai sunt ${d} zile`),
  },
  warning: {
    className: 'bg-amber-500/15 text-amber-300',
    label: (d) => `Mai sunt ${d} zile`,
  },
  ok: {
    className: 'bg-emerald-500/15 text-emerald-300',
    label: (d) => `Mai sunt ${d} zile`,
  },
};

export function DocumentExpiryCard() {
  const headingId = useId();
  const [docs, setDocs] = useState<CourierDocs>(EMPTY_DOCS);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setDocs(readDocs());
    setHydrated(true);
  }, []);

  function onChange(key: DocKey, value: string) {
    const next = { ...docs, [key]: value || null };
    setDocs(next);
    writeDocs(next);
  }

  return (
    <section
      aria-labelledby={headingId}
      className="rounded-2xl border border-hir-border bg-hir-surface p-5"
    >
      <div className="mb-4 flex items-center gap-2">
        <FileWarning className="h-5 w-5 text-violet-400" aria-hidden />
        <h2 id={headingId} className="text-base font-semibold text-hir-fg">
          Documente curier
        </h2>
      </div>
      <p className="mb-4 text-xs text-hir-muted-fg">
        Datele sunt stocate doar pe acest dispozitiv. Le folosim pentru a-ți
        aminti înainte să expire un document necesar livrării.
      </p>

      <div className="flex flex-col gap-4">
        {(Object.keys(DOC_LABELS) as DocKey[]).map((key) => {
          const meta = DOC_LABELS[key];
          const value = docs[key];
          const { state, daysRemaining } = classifyExpiry(value);
          const chip = CHIP_STYLE[state];
          return (
            <div key={key} className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-3">
                <label className="text-sm font-medium text-hir-fg">
                  {meta.label}
                  {!meta.required ? (
                    <span className="ml-1 text-xs font-normal text-hir-muted-fg">(opțional)</span>
                  ) : null}
                </label>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${chip.className}`}
                >
                  {hydrated ? chip.label(daysRemaining) : '—'}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="date"
                  value={value ?? ''}
                  onChange={(e) => onChange(key, e.target.value)}
                  className="min-h-[44px] flex-1 rounded-lg border border-hir-border bg-hir-bg px-3 text-sm text-hir-fg focus-visible:border-violet-500 focus-visible:outline-none"
                />
                <span className="w-24 shrink-0 text-right text-xs text-hir-muted-fg">
                  {formatRoDate(value)}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-4 text-[11px] text-hir-muted-fg">
        Nu trimitem aceste date către server. Sunt doar pentru memento personal.
      </p>
    </section>
  );
}
