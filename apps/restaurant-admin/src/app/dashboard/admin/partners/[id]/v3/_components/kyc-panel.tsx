'use client';

import { useState, useTransition } from 'react';
import { updateKycStatusAction, type KycStatus } from '../actions';

const KYC_STATUS_OPTIONS: { value: KycStatus; label: string }[] = [
  { value: 'UNVERIFIED', label: 'Neverificat' },
  { value: 'PENDING_REVIEW', label: 'In revizuire' },
  { value: 'VERIFIED', label: 'Verificat' },
  { value: 'REJECTED', label: 'Respins' },
];

const STATUS_BADGE: Record<KycStatus, string> = {
  UNVERIFIED: 'bg-zinc-100 text-zinc-600',
  PENDING_REVIEW: 'bg-amber-100 text-amber-800',
  VERIFIED: 'bg-emerald-100 text-emerald-800',
  REJECTED: 'bg-rose-100 text-rose-800',
};

export function KycPanel({
  partnerId,
  iban,
  cnpHash,
  cui,
  address,
  currentStatus,
  kycVerifiedAt,
  kycNotes,
}: {
  partnerId: string;
  iban: string | null;
  cnpHash: string | null;
  cui: string | null;
  address: string | null;
  currentStatus: KycStatus;
  kycVerifiedAt: string | null;
  kycNotes: string | null;
}) {
  const [status, setStatus] = useState<KycStatus>(currentStatus);
  const [notes, setNotes] = useState(kycNotes ?? '');
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  function handleUpdate(newStatus: KycStatus) {
    setResult(null);
    setStatus(newStatus);
    startTransition(async () => {
      const res = await updateKycStatusAction(partnerId, newStatus, notes);
      setResult(
        res.ok
          ? { ok: true, msg: `Status KYC actualizat: ${newStatus}` }
          : { ok: false, msg: res.error },
      );
    });
  }

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
      <h2 className="mb-1 text-base font-semibold text-zinc-900">Revizie KYC</h2>
      <p className="mb-4 text-xs text-zinc-500">
        Date identitate furnizate de partener (read-only). Actualizati statusul dupa verificare manuala.
      </p>

      {/* Read-only fields */}
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="IBAN" value={iban} />
        <Field label="CNP (hash SHA-256)" value={cnpHash} mono />
        <Field label="CUI firma" value={cui} />
        <Field label="Adresa" value={address} />
      </div>

      {/* Current status badge */}
      <div className="mb-3 flex items-center gap-2">
        <span className="text-xs text-zinc-500">Status curent:</span>
        <span
          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[status]}`}
        >
          {status}
        </span>
        {kycVerifiedAt && status === 'VERIFIED' && (
          <span className="text-xs text-zinc-400">
            verificat la {new Date(kycVerifiedAt).toLocaleDateString('ro-RO')}
          </span>
        )}
      </div>

      {/* Notes textarea */}
      <div className="mb-4 flex flex-col gap-1">
        <label htmlFor="kyc-notes" className="text-xs font-medium text-zinc-700">
          Note revizie (opțional)
        </label>
        <textarea
          id="kyc-notes"
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Observatii, motive respingere etc."
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm"
        />
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2">
        {KYC_STATUS_OPTIONS.filter((o) => o.value !== status).map((opt) => {
          const btnColor =
            opt.value === 'VERIFIED'
              ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
              : opt.value === 'REJECTED'
                ? 'bg-rose-600 hover:bg-rose-700 text-white'
                : opt.value === 'PENDING_REVIEW'
                  ? 'bg-amber-500 hover:bg-amber-600 text-white'
                  : 'bg-zinc-200 hover:bg-zinc-300 text-zinc-800';

          return (
            <button
              key={opt.value}
              type="button"
              disabled={pending}
              onClick={() => handleUpdate(opt.value)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium disabled:opacity-50 ${btnColor}`}
            >
              {pending ? '...' : `Seteaza ${opt.label}`}
            </button>
          );
        })}
      </div>

      {result && (
        <p className={`mt-2 text-xs ${result.ok ? 'text-emerald-600' : 'text-rose-600'}`}>
          {result.msg}
        </p>
      )}
    </section>
  );
}

function Field({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string | null;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs font-medium text-zinc-500">{label}</span>
      <span
        className={`rounded-md border border-zinc-100 bg-zinc-50 px-3 py-1.5 text-sm text-zinc-800 ${mono ? 'font-mono text-xs' : ''}`}
      >
        {value ?? <span className="italic text-zinc-400">— necompletat —</span>}
      </span>
    </div>
  );
}
