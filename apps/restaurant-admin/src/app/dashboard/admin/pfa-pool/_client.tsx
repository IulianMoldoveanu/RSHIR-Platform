'use client';

import { useMemo, useState, useTransition } from 'react';
import {
  overridePfaKyf,
  togglePfaFleetActive,
  type PfaDecision,
} from './actions';

export type KyfStatus = 'PENDING' | 'VERIFIED' | 'REJECTED' | 'VERIFIED_PFA_LIGHT';

export type PfaFleetVM = {
  fleetId: string;
  fleetName: string;
  cui: string | null;
  companyName: string | null;
  ownerUserId: string | null;
  ownerName: string | null;
  ownerPhone: string | null;
  isActive: boolean;
  kyfStatus: KyfStatus | null;
  kycStatus: 'PENDING' | 'VERIFIED' | 'REJECTED' | null;
  anafActive: boolean | null;
  anafCheckedAt: string | null;
  verifiedAt: string | null;
  submittedAt: string | null;
  rejectedReason: string | null;
  createdAt: string | null;
  address: string | null;
  idDocUrl: string | null;
  selfieUrl: string | null;
};

type Filter = 'ALL' | 'VERIFIED' | 'PENDING' | 'REJECTED' | 'INACTIVE';

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleString('ro-RO', { dateStyle: 'medium', timeStyle: 'short' });
}

function matchFilter(vm: PfaFleetVM, filter: Filter): boolean {
  switch (filter) {
    case 'ALL':
      return true;
    case 'VERIFIED':
      return vm.kyfStatus === 'VERIFIED_PFA_LIGHT' || vm.kyfStatus === 'VERIFIED';
    case 'PENDING':
      return vm.kyfStatus === 'PENDING' || vm.kyfStatus === null;
    case 'REJECTED':
      return vm.kyfStatus === 'REJECTED';
    case 'INACTIVE':
      return !vm.isActive;
    default:
      return true;
  }
}

export function PfaPoolClient({ fleets }: { fleets: PfaFleetVM[] }) {
  const [filter, setFilter] = useState<Filter>('ALL');
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return fleets.filter((f) => {
      if (!matchFilter(f, filter)) return false;
      if (!q) return true;
      return (
        f.fleetName.toLowerCase().includes(q) ||
        (f.cui ?? '').toLowerCase().includes(q) ||
        (f.companyName ?? '').toLowerCase().includes(q) ||
        (f.ownerName ?? '').toLowerCase().includes(q) ||
        (f.ownerPhone ?? '').toLowerCase().includes(q)
      );
    });
  }, [fleets, filter, query]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        {(['ALL', 'VERIFIED', 'PENDING', 'REJECTED', 'INACTIVE'] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`min-h-[44px] rounded-full px-3 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-violet-500 focus-visible:outline-offset-2 ${
              filter === f
                ? 'bg-violet-600 text-white'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            {f === 'ALL'
              ? 'Toate'
              : f === 'VERIFIED'
                ? 'Verificate'
                : f === 'PENDING'
                  ? 'În așteptare'
                  : f === 'REJECTED'
                    ? 'Respinse'
                    : 'Inactive'}
          </button>
        ))}
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Caută după CUI, nume, telefon…"
          className="ml-auto min-h-[44px] w-full rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100 placeholder:text-slate-600 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/30 sm:w-72"
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState label="Niciun PFA în această categorie." />
      ) : (
        <ul className="flex flex-col gap-3">
          {filtered.map((vm) => (
            <li key={vm.fleetId}>
              <PfaCard vm={vm} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PfaCard({ vm }: { vm: PfaFleetVM }) {
  return (
    <article className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-100">
            {vm.companyName || vm.fleetName}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            {vm.cui ? `CUI ${vm.cui}` : 'fără CUI'}
            {vm.ownerName ? ` · ${vm.ownerName}` : ''}
            {vm.ownerPhone ? ` · ${vm.ownerPhone}` : ''}
          </p>
          {vm.address ? <p className="mt-1 text-[11px] text-slate-500">{vm.address}</p> : null}
        </div>
        <div className="flex flex-col items-end gap-1">
          <KyfBadge status={vm.kyfStatus} />
          <ActiveBadge isActive={vm.isActive} />
          {vm.anafActive === false ? (
            <span className="rounded-full bg-rose-500/10 px-2 py-0.5 text-[10px] font-semibold text-rose-300">
              ANAF: inactiv
            </span>
          ) : vm.anafActive ? (
            <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
              ANAF: activ
            </span>
          ) : null}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <DocLink label="Act identitate" url={vm.idDocUrl} />
        <DocLink label="Selfie" url={vm.selfieUrl} />
      </div>

      <p className="mt-2 text-[11px] text-slate-600">
        Înregistrat: {fmtDate(vm.createdAt)}
        {vm.submittedAt ? ` · Trimis: ${fmtDate(vm.submittedAt)}` : ''}
        {vm.verifiedAt ? ` · Verificat: ${fmtDate(vm.verifiedAt)}` : ''}
        {vm.anafCheckedAt ? ` · ANAF: ${fmtDate(vm.anafCheckedAt)}` : ''}
      </p>
      {vm.kyfStatus === 'REJECTED' && vm.rejectedReason ? (
        <p className="mt-1 text-[11px] text-rose-300">Motiv respingere: {vm.rejectedReason}</p>
      ) : null}

      <div className="mt-3 border-t border-slate-800 pt-3">
        <OverrideControls vm={vm} />
      </div>
    </article>
  );
}

function OverrideControls({ vm }: { vm: PfaFleetVM }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');

  function run(decision: PfaDecision, withReason?: string) {
    setError(null);
    start(async () => {
      const r = await overridePfaKyf(vm.fleetId, decision, withReason);
      if (!r.ok) setError(r.error);
    });
  }

  function flipActive() {
    setError(null);
    start(async () => {
      const r = await togglePfaFleetActive(vm.fleetId, !vm.isActive);
      if (!r.ok) setError(r.error);
    });
  }

  if (rejecting) {
    return (
      <div className="flex flex-col gap-2">
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          placeholder="Motivul respingerii (vizibil pentru PFA)…"
          className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-500/30"
        />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pending || !reason.trim()}
            onClick={() => run('REJECTED', reason.trim())}
            className="min-h-[44px] rounded-lg bg-rose-600 px-3 text-xs font-semibold text-white hover:bg-rose-500 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-rose-400 focus-visible:outline-offset-2"
          >
            {pending ? 'Se respinge…' : 'Confirmă respingerea'}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              setRejecting(false);
              setReason('');
            }}
            className="min-h-[44px] rounded-lg border border-slate-700 bg-slate-900 px-3 text-xs text-slate-300 hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-violet-500 focus-visible:outline-offset-2"
          >
            Anulează
          </button>
        </div>
        {error ? <p className="text-xs text-rose-400">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => run('VERIFIED_PFA_LIGHT')}
        className="min-h-[44px] rounded-lg bg-emerald-600 px-3 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-emerald-400 focus-visible:outline-offset-2"
      >
        {pending ? 'Se aplică…' : 'Verifică (PFA-light)'}
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => setRejecting(true)}
        className="min-h-[44px] rounded-lg border border-slate-700 bg-slate-900 px-3 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-rose-400 focus-visible:outline-offset-2"
      >
        Respinge
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => run('PENDING')}
        className="min-h-[44px] rounded-lg border border-slate-700 bg-slate-900 px-3 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-violet-500 focus-visible:outline-offset-2"
      >
        Re-queue
      </button>
      <span className="ml-auto inline-flex items-center gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={flipActive}
          className={`min-h-[44px] rounded-lg px-3 text-xs font-semibold transition-colors disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 ${
            vm.isActive
              ? 'border border-amber-500/40 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20 focus-visible:outline-amber-400'
              : 'border border-emerald-500/40 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20 focus-visible:outline-emerald-400'
          }`}
        >
          {pending ? '…' : vm.isActive ? 'Suspendă flota' : 'Reactivează flota'}
        </button>
      </span>
      {error ? <p className="basis-full text-xs text-rose-400">{error}</p> : null}
    </div>
  );
}

function KyfBadge({ status }: { status: KyfStatus | null }) {
  const cfg =
    status === 'VERIFIED_PFA_LIGHT'
      ? { label: 'PFA-light verificat', cls: 'bg-emerald-500/20 text-emerald-300' }
      : status === 'VERIFIED'
        ? { label: 'KYF complet', cls: 'bg-emerald-500/20 text-emerald-300' }
        : status === 'REJECTED'
          ? { label: 'Respins', cls: 'bg-rose-500/20 text-rose-300' }
          : status === 'PENDING'
            ? { label: 'În așteptare', cls: 'bg-amber-500/20 text-amber-300' }
            : { label: 'Fără KYF', cls: 'bg-slate-700 text-slate-300' };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

function ActiveBadge({ isActive }: { isActive: boolean }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
        isActive ? 'bg-emerald-500/10 text-emerald-300' : 'bg-slate-700 text-slate-300'
      }`}
    >
      {isActive ? 'Activă' : 'Inactivă'}
    </span>
  );
}

function DocLink({ label, url }: { label: string; url: string | null }) {
  if (!url) {
    return (
      <span className="inline-flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-900/40 px-2.5 py-1 text-[11px] text-slate-500">
        {label}: lipsă
      </span>
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex min-h-[44px] items-center gap-1 rounded-lg border border-slate-700 bg-slate-900 px-2.5 text-[11px] font-medium text-violet-300 hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-violet-400 focus-visible:outline-offset-2"
    >
      {label} ↗
    </a>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <p className="rounded-xl border border-dashed border-slate-800 bg-slate-900/40 px-4 py-6 text-center text-sm text-slate-500">
      {label}
    </p>
  );
}
