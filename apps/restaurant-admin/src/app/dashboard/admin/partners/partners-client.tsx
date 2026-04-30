'use client';

import { useState, useTransition } from 'react';
import { createPartner, addReferral, markCommissionPaid } from './actions';

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
// PartnersClient
// ────────────────────────────────────────────────────────────

export function PartnersClient({
  partners,
  commissions,
}: {
  partners: Partner[];
  commissions: Commission[];
}) {
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
