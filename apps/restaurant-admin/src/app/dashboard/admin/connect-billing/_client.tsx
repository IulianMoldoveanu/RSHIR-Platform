'use client';

import { useState, useTransition } from 'react';
import { setInvoiceStatus, generatePreviousWeek, type InvoiceStatus } from './actions';

export type InvoiceVM = {
  id: string;
  tenant: string;
  periodStart: string;
  periodEnd: string;
  ordersCount: number;
  deliveryFeesCents: number;
  dataFeeCents: number;
  totalCents: number;
  currency: string;
  status: InvoiceStatus;
};

function ron(cents: number): string {
  return (cents / 100).toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const STATUS_TONE: Record<InvoiceStatus, string> = {
  DRAFT: 'bg-amber-50 text-amber-700',
  ISSUED: 'bg-blue-50 text-blue-700',
  PAID: 'bg-emerald-50 text-emerald-700',
  VOID: 'bg-zinc-100 text-zinc-500',
};

export function ConnectBillingClient({
  invoices,
  draftTotalCents,
  issuedTotalCents,
  paidTotalCents,
}: {
  invoices: InvoiceVM[];
  draftTotalCents: number;
  issuedTotalCents: number;
  paidTotalCents: number;
}) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  function advance(id: string, status: InvoiceStatus) {
    setErr(null);
    setMsg(null);
    start(async () => {
      const r = await setInvoiceStatus(id, status);
      if (!r.ok) setErr(r.error);
    });
  }

  function generate() {
    setErr(null);
    setMsg(null);
    start(async () => {
      const r = await generatePreviousWeek();
      if (r.ok) setMsg(`Generat: ${r.created ?? 0} factură(i) noi pentru săptămâna trecută.`);
      else setErr(r.error);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Command Center · Billing Connect
        </div>
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
          Billing săptămânal Connect (HIR → tenant)
        </h1>
        <p className="max-w-2xl text-sm text-zinc-600">
          Ce facturează HIR fiecărui tenant headless pentru livrare: tariful pe zone + 2 RON/comandă
          (data layer). Generat automat lunea (cron) sau la cerere mai jos; tu avansezi
          DRAFT → emisă → plătită.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard label="DRAFT (de emis)" value={ron(draftTotalCents)} tone="amber" />
        <SummaryCard label="Emise (de încasat)" value={ron(issuedTotalCents)} tone="blue" />
        <SummaryCard label="Plătite" value={ron(paidTotalCents)} tone="emerald" />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={generate}
          disabled={pending}
          className="rounded-lg bg-violet-600 px-3 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50"
        >
          {pending ? 'Procesez…' : 'Generează săptămâna trecută'}
        </button>
        {msg && <span className="text-xs text-emerald-600">{msg}</span>}
        {err && <span className="text-xs text-rose-600">{err}</span>}
      </div>

      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
              <th className="px-4 py-2.5 font-medium">Tenant</th>
              <th className="px-4 py-2.5 font-medium">Săptămâna</th>
              <th className="px-4 py-2.5 text-right font-medium">Comenzi</th>
              <th className="px-4 py-2.5 text-right font-medium">Livrare</th>
              <th className="px-4 py-2.5 text-right font-medium">Data (2/cmd)</th>
              <th className="px-4 py-2.5 text-right font-medium">Total</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {invoices.map((i) => (
              <tr key={i.id} className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50">
                <td className="px-4 py-3 font-medium text-zinc-900">{i.tenant}</td>
                <td className="px-4 py-3 text-xs text-zinc-600">
                  {i.periodStart} → {i.periodEnd}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-zinc-700">{i.ordersCount}</td>
                <td className="px-4 py-3 text-right tabular-nums text-zinc-700">{ron(i.deliveryFeesCents)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-zinc-500">{ron(i.dataFeeCents)}</td>
                <td className="px-4 py-3 text-right font-semibold tabular-nums text-zinc-900">
                  {ron(i.totalCents)} {i.currency}
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_TONE[i.status]}`}>
                    {i.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-1.5">
                    {i.status === 'DRAFT' && (
                      <ActionBtn label="Emite" onClick={() => advance(i.id, 'ISSUED')} disabled={pending} />
                    )}
                    {i.status === 'ISSUED' && (
                      <ActionBtn label="Plătită" tone="emerald" onClick={() => advance(i.id, 'PAID')} disabled={pending} />
                    )}
                    {(i.status === 'DRAFT' || i.status === 'ISSUED') && (
                      <ActionBtn label="Anulează" tone="zinc" onClick={() => advance(i.id, 'VOID')} disabled={pending} />
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {invoices.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-sm text-zinc-500">
                  Nicio factură încă. Apar după ce un tenant headless are livrări într-o săptămână.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value: string; tone: 'amber' | 'blue' | 'emerald' }) {
  const toneCls =
    tone === 'amber' ? 'text-amber-700' : tone === 'blue' ? 'text-blue-700' : 'text-emerald-700';
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4">
      <p className="text-xs uppercase tracking-wide text-zinc-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${toneCls}`}>
        {value} <span className="text-sm font-normal text-zinc-400">RON</span>
      </p>
    </div>
  );
}

function ActionBtn({
  label,
  onClick,
  disabled,
  tone = 'violet',
}: {
  label: string;
  onClick: () => void;
  disabled: boolean;
  tone?: 'violet' | 'emerald' | 'zinc';
}) {
  const cls =
    tone === 'emerald'
      ? 'border-emerald-300 text-emerald-700 hover:bg-emerald-50'
      : tone === 'zinc'
        ? 'border-zinc-300 text-zinc-500 hover:bg-zinc-50'
        : 'border-violet-300 text-violet-700 hover:bg-violet-50';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-md border px-2 py-1 text-xs font-medium transition disabled:opacity-50 ${cls}`}
    >
      {label}
    </button>
  );
}
