'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { saveFiscalSettings, type SaveFiscalResult } from './actions';
import { VAT_RATE_OPTIONS, type TenantFiscal } from '@/lib/fiscal';

type Format = 'smartbill' | 'saga';

type Feedback = { kind: 'success' | 'error'; message: string } | null;

const MONTH_LABELS_RO = [
  'Ianuarie',
  'Februarie',
  'Martie',
  'Aprilie',
  'Mai',
  'Iunie',
  'Iulie',
  'August',
  'Septembrie',
  'Octombrie',
  'Noiembrie',
  'Decembrie',
];

function errorLabel(result: Extract<SaveFiscalResult, { ok: false }>): string {
  const map: Record<string, string> = {
    forbidden_owner_only: 'Doar OWNER poate modifica datele fiscale.',
    unauthenticated: 'Sesiune expirată — autentificați-vă din nou.',
    invalid_input: 'Date invalide. Verificați CUI-ul și cota TVA.',
    tenant_mismatch: 'Restaurantul activ s-a schimbat — reîncărcați pagina.',
    db_error: 'Eroare la salvare.',
  };
  const base = map[result.error] ?? result.error;
  return result.detail ? `${base} (${result.detail})` : base;
}

export function ExportsClient({
  tenantId,
  tenantSlug,
  canEdit,
  fiscal,
  defaultYear,
  defaultMonth,
}: {
  tenantId: string;
  tenantSlug: string;
  canEdit: boolean;
  fiscal: TenantFiscal;
  defaultYear: number;
  defaultMonth: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [legalName, setLegalName] = useState(fiscal.legal_name);
  const [cui, setCui] = useState(fiscal.cui);
  const [vatRate, setVatRate] = useState(fiscal.vat_rate_pct);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const [year, setYear] = useState(defaultYear);
  const [month, setMonth] = useState(defaultMonth);
  const [format, setFormat] = useState<Format>('smartbill');

  // Year options: last 3 calendar years + current. Older data can still be
  // exported by manually editing the URL — keeps the picker focused.
  const yearOptions = useMemo(() => {
    const thisYear = new Date().getUTCFullYear();
    return [thisYear, thisYear - 1, thisYear - 2, thisYear - 3];
  }, []);

  function saveFiscal(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canEdit) return;
    setFeedback(null);
    const fd = new FormData();
    fd.set('legal_name', legalName.trim());
    fd.set('cui', cui.trim());
    fd.set('vat_rate_pct', String(vatRate));
    fd.set('tenantId', tenantId);
    start(async () => {
      const result = await saveFiscalSettings(fd);
      if (result.ok) {
        setFeedback({ kind: 'success', message: 'Datele fiscale au fost salvate.' });
        router.refresh();
      } else {
        setFeedback({ kind: 'error', message: errorLabel(result) });
      }
    });
  }

  const downloadHref = `/api/dashboard/exports/sales-register?year=${year}&month=${month}&format=${format}`;
  const filenamePreview = `vanzari-${tenantSlug}-${year}-${String(month).padStart(2, '0')}-${format}.csv`;

  return (
    <div className="flex flex-col gap-6">
      {/* --- Fiscal settings card --- */}
      <section className="rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-zinc-900">Date fiscale</h2>
        <p className="mt-1 text-xs text-zinc-600">
          Aceste date apar în fișierele exportate. Le puteți schimba oricând —
          doar exporturile generate ulterior reflectă modificările.
        </p>

        <form onSubmit={saveFiscal} className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="legal_name" className="text-xs font-medium text-zinc-700">
              Denumire firmă
            </label>
            <input
              id="legal_name"
              type="text"
              disabled={!canEdit || pending}
              value={legalName}
              onChange={(e) => setLegalName(e.target.value)}
              maxLength={200}
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none disabled:bg-zinc-50 disabled:opacity-60"
              placeholder="ex: FOISORUL A SRL"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="cui" className="text-xs font-medium text-zinc-700">
              CUI (opțional)
            </label>
            <input
              id="cui"
              type="text"
              disabled={!canEdit || pending}
              value={cui}
              onChange={(e) => setCui(e.target.value)}
              maxLength={20}
              pattern="^(RO)?\d{2,10}$"
              className="w-full rounded-md border border-zinc-300 px-3 py-2 font-mono text-sm focus:border-zinc-900 focus:outline-none disabled:bg-zinc-50 disabled:opacity-60"
              placeholder="ex: RO12345678"
            />
            <p className="text-xs text-zinc-500">
              Opțional. Lăsați gol dacă vindeți numai către persoane fizice.
            </p>
          </div>

          <div className="flex flex-col gap-1.5 sm:col-span-2 sm:max-w-xs">
            <label htmlFor="vat_rate_pct" className="text-xs font-medium text-zinc-700">
              Cota TVA implicită
            </label>
            <select
              id="vat_rate_pct"
              disabled={!canEdit || pending}
              value={vatRate}
              onChange={(e) => setVatRate(Number(e.target.value))}
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none disabled:bg-zinc-50 disabled:opacity-60"
            >
              {VAT_RATE_OPTIONS.map((r) => (
                <option key={r} value={r}>
                  {r}%
                </option>
              ))}
            </select>
            <p className="text-xs text-zinc-500">
              HoReCa folosește 11% (rata redusă în vigoare de la 1 august 2025).
              Cotele 9% și 19% rămân selectabile pentru exporturi pe luni
              istorice când acea cotă era în vigoare.
            </p>
          </div>

          <div className="flex items-center gap-3 sm:col-span-2">
            <button
              type="submit"
              disabled={!canEdit || pending}
              className="rounded-md bg-purple-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-700 disabled:opacity-50"
            >
              {pending ? 'Se salvează…' : 'Salvează datele fiscale'}
            </button>
            {feedback && (
              <p
                className={
                  feedback.kind === 'success'
                    ? 'text-xs text-emerald-700'
                    : 'text-xs text-rose-700'
                }
              >
                {feedback.message}
              </p>
            )}
          </div>
        </form>
      </section>

      {/* --- Download card --- */}
      <section className="rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-zinc-900">Generare export lunar</h2>
        <p className="mt-1 text-xs text-zinc-600">
          Selectați luna și formatul, apoi descărcați fișierul.
        </p>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="year" className="text-xs font-medium text-zinc-700">
              An
            </label>
            <select
              id="year"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none"
            >
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="month" className="text-xs font-medium text-zinc-700">
              Lună
            </label>
            <select
              id="month"
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none"
            >
              {MONTH_LABELS_RO.map((label, idx) => (
                <option key={idx + 1} value={idx + 1}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-zinc-700">Format</span>
            <div className="flex gap-2">
              <FormatRadio
                checked={format === 'smartbill'}
                onChange={() => setFormat('smartbill')}
                label="SmartBill"
              />
              <FormatRadio
                checked={format === 'saga'}
                onChange={() => setFormat('saga')}
                label="SAGA"
              />
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <a
            href={canEdit ? downloadHref : undefined}
            aria-disabled={!canEdit}
            className={
              'inline-flex h-10 items-center rounded-md px-4 text-sm font-medium transition-colors ' +
              (canEdit
                ? 'bg-zinc-900 text-white hover:bg-zinc-800'
                : 'cursor-not-allowed bg-zinc-200 text-zinc-500')
            }
            download={filenamePreview}
            onClick={(e) => {
              if (!canEdit) e.preventDefault();
            }}
          >
            Descarcă CSV
          </a>
          <span className="font-mono text-xs text-zinc-500">{filenamePreview}</span>
        </div>

        <p className="mt-3 text-xs text-zinc-500">
          Dacă pentru luna selectată nu există comenzi livrate, fișierul descărcat
          conține doar antetul (capul de tabel). Acesta este comportamentul așteptat —
          contabilul îl poate folosi ca dovadă „luna fără vânzări online”.
        </p>
      </section>
    </div>
  );
}

function FormatRadio({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onChange}
      aria-pressed={checked}
      className={
        'flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors ' +
        (checked
          ? 'border-purple-600 bg-purple-50 text-purple-900'
          : 'border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50')
      }
    >
      {label}
    </button>
  );
}
