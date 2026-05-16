'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { createPartner, addReferral, markCommissionPaid } from './actions';
import {
  markCommissionPaidAction,
  voidPayoutAction,
} from './payout-actions';

type Partner = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  status: string;
  default_commission_pct: number;
  created_at: string;
  referral_count: number;
  commission_this_month_cents: number;
};

type Commission = {
  id: string;
  partner_id: string;
  period_start: string;
  period_end: string;
  amount_cents: number;
  status: string;
  paid_at: string | null;
  paid_via: string | null;
};

type PendingByMonth = {
  partner_id: string;
  period_month: string;
  amount_cents: number;
};

type Payout = {
  id: string;
  partner_id: string;
  period_month: string;
  gross_cents: number;
  platform_fee_cents: number;
  net_cents: number;
  paid_at: string;
  paid_by_email: string | null;
  proof_url: string | null;
  notes: string | null;
  voided_at: string | null;
};

function centsToRon(cents: number): string {
  return (cents / 100).toFixed(2) + ' RON';
}

function statusBadge(status: string) {
  const cls =
    status === 'ACTIVE'
      ? 'bg-emerald-100 text-emerald-800'
      : status === 'SUSPENDED'
        ? 'bg-amber-100 text-amber-800'
        : 'bg-rose-100 text-rose-800';
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {status}
    </span>
  );
}

// ────────────────────────────────────────────────────────────
// CreatePartnerForm
// ────────────────────────────────────────────────────────────

function CreatePartnerForm() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    const fd = new FormData(e.currentTarget);
    const name = (fd.get('name') as string).trim();
    const email = (fd.get('email') as string).trim();
    const phone = (fd.get('phone') as string).trim() || undefined;
    const pct = parseFloat(fd.get('default_commission_pct') as string);

    if (!name || !email || isNaN(pct)) {
      setError('Completați toate câmpurile obligatorii.');
      return;
    }

    startTransition(async () => {
      const res = await createPartner({ name, email, phone, default_commission_pct: pct });
      if (!res.ok) setError(res.error);
      else { setSuccess(true); (e.target as HTMLFormElement).reset(); }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-zinc-900">Adaugă partener nou</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-zinc-700">Nume *</label>
          <input name="name" required className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-zinc-700">Email *</label>
          <input name="email" type="email" required className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-zinc-700">Telefon</label>
          <input name="phone" className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-zinc-700">Comision implicit % *</label>
          <input
            name="default_commission_pct"
            type="number"
            min="0"
            max="100"
            step="0.01"
            defaultValue="20"
            required
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm"
          />
        </div>
      </div>
      {error && <p className="text-xs text-rose-600">{error}</p>}
      {success && <p className="text-xs text-emerald-600">Partener creat cu succes.</p>}
      <div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-purple-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
        >
          {pending ? 'Se salvează...' : 'Creează partener'}
        </button>
      </div>
    </form>
  );
}

// ────────────────────────────────────────────────────────────
// AddReferralForm
// ────────────────────────────────────────────────────────────

function AddReferralForm({ partners }: { partners: Partner[] }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    const fd = new FormData(e.currentTarget);
    const partner_id = fd.get('partner_id') as string;
    const tenant_id = (fd.get('tenant_id') as string).trim();
    const pctRaw = (fd.get('commission_pct') as string).trim();
    const commission_pct = pctRaw ? parseFloat(pctRaw) : undefined;

    if (!partner_id || !tenant_id) {
      setError('Selectați partenerul și introduceți ID-ul restaurantului.');
      return;
    }

    startTransition(async () => {
      const res = await addReferral({ partner_id, tenant_id, commission_pct });
      if (!res.ok) setError(res.error);
      else { setSuccess(true); (e.target as HTMLFormElement).reset(); }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-zinc-900">Asociază restaurant la partener</h2>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-zinc-700">Partener *</label>
          <select name="partner_id" required className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm">
            <option value="">— selectează —</option>
            {partners.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-zinc-700">Tenant ID (UUID) *</label>
          <input name="tenant_id" required className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-mono text-xs" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-zinc-700">Comision % (opțional)</label>
          <input
            name="commission_pct"
            type="number"
            min="0"
            max="100"
            step="0.01"
            placeholder="implicit partener"
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm"
          />
        </div>
      </div>
      {error && <p className="text-xs text-rose-600">{error}</p>}
      {success && <p className="text-xs text-emerald-600">Referral adăugat.</p>}
      <div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-purple-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
        >
          {pending ? 'Se salvează...' : 'Adaugă referral'}
        </button>
      </div>
    </form>
  );
}

// ────────────────────────────────────────────────────────────
// MarkCommissionPaidForm
// ────────────────────────────────────────────────────────────

const PAID_VIA_OPTIONS = [
  { value: 'bank_transfer', label: 'Transfer bancar' },
  { value: 'invoice_offset', label: 'Compensare factură' },
  { value: 'stripe', label: 'Stripe' },
  { value: 'altul', label: 'Altul' },
] as const;

function MarkCommissionPaidForm({ commission }: { commission: Commission }) {
  const [pending, startTransition] = useTransition();
  const [showNotes, setShowNotes] = useState(false);
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setToast(null);
    const fd = new FormData(e.currentTarget);
    const paid_via = fd.get('paid_via') as string;
    const notes = (fd.get('notes') as string).trim() || undefined;

    startTransition(async () => {
      const res = await markCommissionPaid({
        commission_id: commission.id,
        paid_via,
        notes,
      });
      if (res.ok) {
        setToast({ ok: true, msg: 'Marcat ca plătit.' });
      } else {
        setToast({ ok: false, msg: res.error });
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="mt-2 flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <select
          name="paid_via"
          required
          defaultValue="bank_transfer"
          className="rounded border border-zinc-300 px-2 py-1 text-xs"
        >
          {PAID_VIA_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setShowNotes((v) => !v)}
          className="text-xs text-zinc-500 underline"
        >
          {showNotes ? 'Ascunde note' : 'Adaugă note'}
        </button>
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {pending ? 'Se salvează...' : 'Marchează plătit'}
        </button>
      </div>
      {showNotes && (
        <textarea
          name="notes"
          rows={2}
          placeholder="Note opționale..."
          className="rounded border border-zinc-300 px-2 py-1 text-xs"
        />
      )}
      {toast && (
        <p className={`text-xs ${toast.ok ? 'text-emerald-600' : 'text-rose-600'}`}>{toast.msg}</p>
      )}
    </form>
  );
}

// ────────────────────────────────────────────────────────────
// CommissionRow
// ────────────────────────────────────────────────────────────

function CommissionRow({ commission }: { commission: Commission }) {
  const isPending = commission.status === 'PENDING';
  return (
    <tr className="hover:bg-zinc-50">
      <td className="px-4 py-3 tabular-nums text-xs text-zinc-500">
        {commission.period_start} – {commission.period_end}
      </td>
      <td className="px-4 py-3 text-right tabular-nums font-medium text-zinc-900">
        {centsToRon(commission.amount_cents)}
      </td>
      <td className="px-4 py-3">
        <span
          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
            isPending
              ? 'bg-amber-100 text-amber-800'
              : commission.status === 'PAID'
                ? 'bg-emerald-100 text-emerald-800'
                : 'bg-zinc-100 text-zinc-500'
          }`}
        >
          {commission.status}
        </span>
        {commission.paid_at && (
          <span className="ml-2 text-xs text-zinc-400">
            {commission.paid_via} · {commission.paid_at.slice(0, 10)}
          </span>
        )}
      </td>
      <td className="px-4 py-3">
        {isPending && <MarkCommissionPaidForm commission={commission} />}
      </td>
    </tr>
  );
}

// ────────────────────────────────────────────────────────────
// MarkPayoutModal — record a partner_payouts row for a partner + month.
//
// Triggered by the "Mark paid" button on a partner row. Pre-fills the
// month picker + gross amount from the largest pending month for that
// partner, but the operator can override both.
// ────────────────────────────────────────────────────────────

function MarkPayoutModal({
  partner,
  pendingByMonth,
  onClose,
}: {
  partner: Partner;
  pendingByMonth: PendingByMonth[];
  onClose: () => void;
}) {
  const partnerPending = pendingByMonth.filter((p) => p.partner_id === partner.id);
  const firstPending = partnerPending[0];

  const [periodMonth, setPeriodMonth] = useState<string>(
    firstPending?.period_month.slice(0, 7) ?? '',
  );
  const [grossCents, setGrossCents] = useState<string>(
    firstPending ? (firstPending.amount_cents / 100).toFixed(2) : '',
  );
  const [feeCents, setFeeCents] = useState<string>('0');
  const [proofUrl, setProofUrl] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const gross = Math.round(parseFloat(grossCents) * 100);
    const fee = Math.round(parseFloat(feeCents || '0') * 100);
    if (!periodMonth) {
      setError('Selectați luna.');
      return;
    }
    if (!Number.isFinite(gross) || gross < 0) {
      setError('Suma gross invalidă.');
      return;
    }
    if (!Number.isFinite(fee) || fee < 0) {
      setError('Comisionul platformei invalid.');
      return;
    }

    startTransition(async () => {
      const res = await markCommissionPaidAction({
        partner_id: partner.id,
        period_month: periodMonth,
        gross_cents: gross,
        platform_fee_cents: fee,
        proof_url: proofUrl.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      if (!res.ok) {
        setError(res.error);
      } else {
        onClose();
      }
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between">
          <div>
            <h3 className="text-sm font-semibold text-zinc-900">Înregistrează plată</h3>
            <p className="text-xs text-zinc-500">{partner.name} · {partner.email}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-600"
            aria-label="Închide"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-zinc-700">Lună (YYYY-MM) *</label>
            <input
              type="month"
              required
              value={periodMonth}
              onChange={(e) => setPeriodMonth(e.target.value)}
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm"
            />
            {partnerPending.length > 1 && (
              <p className="text-xs text-zinc-500">
                Luni cu PENDING: {partnerPending.map((p) => p.period_month.slice(0, 7)).join(', ')}
              </p>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-zinc-700">Sumă brută (RON) *</label>
              <input
                type="number"
                step="0.01"
                min="0"
                required
                value={grossCents}
                onChange={(e) => setGrossCents(e.target.value)}
                className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm tabular-nums"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-zinc-700">Reținere HIR (RON)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={feeCents}
                onChange={(e) => setFeeCents(e.target.value)}
                className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm tabular-nums"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-zinc-700">URL dovadă (opțional)</label>
            <input
              type="url"
              placeholder="https://..."
              value={proofUrl}
              onChange={(e) => setProofUrl(e.target.value)}
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-zinc-700">Note (opțional)</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm"
            />
          </div>

          {error && <p className="text-xs text-rose-600">{error}</p>}

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
            >
              Anulează
            </button>
            <button
              type="submit"
              disabled={pending}
              className="rounded-md bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {pending ? 'Se salvează...' : 'Confirmă plata'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// PayoutHistoryTable — read-only ledger of recorded payouts.
// Offers a "Anulează" (void) button on active rows.
// ────────────────────────────────────────────────────────────

function PayoutHistoryTable({
  payouts,
  partnersById,
}: {
  payouts: Payout[];
  partnersById: Record<string, Partner>;
}) {
  const [pendingVoid, setPendingVoid] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);

  function handleVoid(payoutId: string) {
    const reason = window.prompt('Motiv anulare (opțional):') ?? undefined;
    if (reason === null) return;
    setPendingVoid(payoutId);
    setToast(null);
    startTransition(async () => {
      const res = await voidPayoutAction({ payout_id: payoutId, reason });
      setPendingVoid(null);
      setToast(res.ok
        ? { ok: true, msg: 'Payout anulat.' }
        : { ok: false, msg: res.error });
    });
  }

  if (payouts.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-zinc-300 bg-white px-6 py-6 text-center text-xs text-zinc-500">
        Niciun payout înregistrat încă.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
      <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-2">
        <span className="text-xs font-medium text-zinc-500">Istoric plăți</span>
      </div>
      {toast && (
        <p className={`px-4 py-2 text-xs ${toast.ok ? 'text-emerald-600' : 'text-rose-600'}`}>
          {toast.msg}
        </p>
      )}
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-200 bg-zinc-50 text-xs text-zinc-500">
            <th className="px-4 py-2 text-left font-medium">Partener</th>
            <th className="px-4 py-2 text-left font-medium">Lună</th>
            <th className="px-4 py-2 text-right font-medium">Brut</th>
            <th className="px-4 py-2 text-right font-medium">Reținere</th>
            <th className="px-4 py-2 text-right font-medium">Net</th>
            <th className="px-4 py-2 text-left font-medium">Plătit la</th>
            <th className="px-4 py-2 text-left font-medium">De către</th>
            <th className="px-4 py-2 text-left font-medium">Dovadă</th>
            <th className="px-4 py-2 text-left font-medium">Status</th>
            <th className="px-4 py-2 text-right font-medium">Acțiune</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {payouts.map((p) => {
            const partner = partnersById[p.partner_id];
            const isVoided = Boolean(p.voided_at);
            return (
              <tr key={p.id} className={isVoided ? 'bg-zinc-50 text-zinc-400' : 'hover:bg-zinc-50'}>
                <td className="px-4 py-2">{partner?.name ?? p.partner_id.slice(0, 8)}</td>
                <td className="px-4 py-2 tabular-nums text-xs">{p.period_month.slice(0, 7)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{centsToRon(p.gross_cents)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{centsToRon(p.platform_fee_cents)}</td>
                <td className="px-4 py-2 text-right tabular-nums font-medium">{centsToRon(p.net_cents)}</td>
                <td className="px-4 py-2 text-xs">{p.paid_at.slice(0, 10)}</td>
                <td className="px-4 py-2 text-xs">{p.paid_by_email ?? '—'}</td>
                <td className="px-4 py-2 text-xs">
                  {p.proof_url ? (
                    <a
                      href={p.proof_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-purple-600 underline"
                    >
                      link
                    </a>
                  ) : '—'}
                </td>
                <td className="px-4 py-2 text-xs">
                  {isVoided ? (
                    <span className="inline-flex rounded-full bg-zinc-200 px-2 py-0.5 text-xs">
                      VOIDED
                    </span>
                  ) : (
                    <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">
                      PAID
                    </span>
                  )}
                </td>
                <td className="px-4 py-2 text-right">
                  {!isVoided && (
                    <button
                      type="button"
                      disabled={pendingVoid === p.id}
                      onClick={() => handleVoid(p.id)}
                      className="text-xs text-rose-600 underline disabled:opacity-50"
                    >
                      {pendingVoid === p.id ? '...' : 'Anulează'}
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// PartnersClient
// ────────────────────────────────────────────────────────────

export function PartnersClient({
  partners,
  commissions,
  pendingByMonth,
  payouts,
}: {
  partners: Partner[];
  commissions: Commission[];
  pendingByMonth: PendingByMonth[];
  payouts: Payout[];
}) {
  const [modalPartner, setModalPartner] = useState<Partner | null>(null);
  const partnersById = Object.fromEntries(partners.map((p) => [p.id, p]));
  const pendingCountByPartner: Record<string, number> = {};
  for (const pm of pendingByMonth) {
    pendingCountByPartner[pm.partner_id] = (pendingCountByPartner[pm.partner_id] ?? 0) + 1;
  }
  return (
    <div className="flex flex-col gap-6">
      {/* Partner list */}
      {partners.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-300 bg-white px-6 py-10 text-center">
          <p className="text-sm font-medium text-zinc-700">Niciun partener înregistrat încă.</p>
          <p className="mt-1 text-xs text-zinc-500">
            Adaugă primul partener de vânzări HIR mai jos. Partenerii aduc restaurante pe platformă
            și câștigă comision lunar pe comenzile generate.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 text-xs text-zinc-500">
                <th className="px-4 py-2 text-left font-medium">Partener</th>
                <th className="px-4 py-2 text-left font-medium">Status</th>
                <th className="px-4 py-2 text-right font-medium">Comision %</th>
                <th className="px-4 py-2 text-right font-medium">Restaurante</th>
                <th className="px-4 py-2 text-right font-medium">Comision luna aceasta</th>
                <th className="px-4 py-2 text-right font-medium">Plată</th>
                <th className="px-4 py-2 text-right font-medium">v3</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {partners.map((p) => (
                <tr key={p.id} className="hover:bg-zinc-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-zinc-900">{p.name}</div>
                    <div className="text-xs text-zinc-500">{p.email}</div>
                  </td>
                  <td className="px-4 py-3">{statusBadge(p.status)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {p.default_commission_pct.toFixed(2)}%
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{p.referral_count}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium text-zinc-900">
                    {centsToRon(p.commission_this_month_cents)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {(pendingCountByPartner[p.id] ?? 0) > 0 ? (
                      <button
                        type="button"
                        onClick={() => setModalPartner(p)}
                        className="rounded-md bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-700"
                      >
                        Marchează plătit ({pendingCountByPartner[p.id]})
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setModalPartner(p)}
                        className="rounded-md border border-zinc-300 px-3 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
                      >
                        Înregistrează plată
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/dashboard/admin/partners/${p.id}/v3`}
                      className="rounded-md border border-violet-300 bg-violet-50 px-2 py-1 text-xs font-medium text-violet-700 hover:bg-violet-100"
                    >
                      v3
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Payouts ledger */}
      <PayoutHistoryTable payouts={payouts} partnersById={partnersById} />

      {modalPartner && (
        <MarkPayoutModal
          partner={modalPartner}
          pendingByMonth={pendingByMonth}
          onClose={() => setModalPartner(null)}
        />
      )}

      {/* Commission list with markCommissionPaid inline form */}
      {commissions.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
          <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-2">
            <span className="text-xs font-medium text-zinc-500">Comisioane</span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 text-xs text-zinc-500">
                <th className="px-4 py-2 text-left font-medium">Perioadă</th>
                <th className="px-4 py-2 text-right font-medium">Sumă</th>
                <th className="px-4 py-2 text-left font-medium">Status</th>
                <th className="px-4 py-2 text-left font-medium">Acțiune</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {commissions.map((c) => (
                <CommissionRow key={c.id} commission={c} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Forms */}
      <CreatePartnerForm />
      <AddReferralForm partners={partners} />
    </div>
  );
}
