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
import { cardClasses } from './card';

type DocKey = keyof CourierDocs;

const DOC_LABELS: Record<DocKey, { label: string; required: boolean; hint?: string }> = {
  dl: { label: 'Permis de conducere', required: true },
  vehicleReg: { label: 'Carte de identitate vehicul', required: true },
  rca: { label: 'RCA (asigurare obligatorie)', required: true },
  casco: { label: 'CASCO', required: false },
  itp: {
    label: 'Inspecție tehnică (ITP)',
    required: true,
    hint: 'Obligatorie pentru scuter, motocicletă și autoturism.',
  },
  atestat: {
    label: 'Atestat profesional transport',
    required: false,
    hint: 'Necesar la livrare contra cost cu autoturism (peste 3,5 t și/sau servicii reglementate ARR).',
  },
};

const CHIP_STYLE: Record<ExpiryState, { className: string; label: (d: number | null) => string }> = {
  unset: {
    className: 'border-hir-border/60 bg-hir-border/40 text-hir-muted-fg ring-hir-border/40',
    label: () => 'Necompletat',
  },
  expired: {
    className: 'border-rose-500/40 bg-rose-500/15 text-rose-200 ring-rose-500/20',
    label: (d) => (d !== null ? `Expirat acum ${Math.abs(d)} zile` : 'Expirat'),
  },
  critical: {
    className: 'border-rose-500/40 bg-rose-500/15 text-rose-200 ring-rose-500/20',
    label: (d) => (d === 0 ? 'Expiră azi' : `Mai sunt ${d} zile`),
  },
  warning: {
    className: 'border-amber-500/40 bg-amber-500/15 text-amber-200 ring-amber-500/20',
    label: (d) => `Mai sunt ${d} zile`,
  },
  ok: {
    className: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-200 ring-emerald-500/20',
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
      className={cardClasses({ padding: 'lg' })}
    >
      <div className="mb-3 flex items-start gap-3">
        <span
          aria-hidden
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-500/15 ring-1 ring-violet-500/30"
        >
          <FileWarning className="h-4 w-4 text-violet-300" strokeWidth={2.25} />
        </span>
        <div className="flex flex-1 flex-col gap-1">
          <h2 id={headingId} className="text-base font-semibold text-hir-fg">
            Documente curier
          </h2>
          <p className="text-xs leading-relaxed text-hir-muted-fg">
            Datele sunt stocate doar pe acest dispozitiv. Le folosim pentru a-ți
            aminti înainte să expire un document necesar livrării.
          </p>
        </div>
      </div>

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
                  className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ${chip.className}`}
                >
                  {hydrated ? chip.label(daysRemaining) : '—'}
                </span>
              </div>
              {meta.hint ? (
                <p className="text-[11px] leading-relaxed text-hir-muted-fg">{meta.hint}</p>
              ) : null}
              <div className="flex items-center gap-3">
                <input
                  type="date"
                  value={value ?? ''}
                  onChange={(e) => onChange(key, e.target.value)}
                  className="min-h-[44px] flex-1 rounded-lg border border-hir-border bg-hir-bg px-3 text-sm tabular-nums text-hir-fg transition focus-visible:border-violet-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/20"
                />
                <span className="w-24 shrink-0 text-right text-xs tabular-nums text-hir-muted-fg">
                  {formatRoDate(value)}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-4 text-[11px] leading-relaxed text-hir-muted-fg">
        Nu trimitem aceste date către server. Sunt doar pentru memento personal.
      </p>
    </section>
  );
}
