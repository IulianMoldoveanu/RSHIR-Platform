'use client';

import { useState, useTransition } from 'react';
import {
  Bike,
  Building2,
  Check,
  ExternalLink,
  Loader2,
  ShieldCheck,
  User,
  X,
} from 'lucide-react';
import { Button } from '@hir/ui';
import { courierDisplayName } from '@/lib/courier-display';
import { verifyCourierKyc, verifyFleetKyf, type Decision } from './actions';

export type CourierVM = {
  userId: string;
  legalName: string | null;
  fullName: string | null;
  city: string | null;
  vehicleType: string | null;
  fleetName: string | null;
  fleetPrefix: string | null;
  cnpLast4: string | null;
  submittedAt: string | null;
  idDocUrl: string | null;
  selfieUrl: string | null;
};

export type FleetVM = {
  fleetId: string;
  fleetName: string | null;
  cui: string | null;
  companyName: string | null;
  regCom: string | null;
  caenCode: string | null;
  address: string | null;
  vatPayer: boolean | null;
  anafActive: boolean | null;
  submittedAt: string | null;
  actUrl: string | null;
  extrasUrl: string | null;
  certificatUrl: string | null;
};

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('ro-RO', { dateStyle: 'medium', timeStyle: 'short' });
}

export function VerificationsClient({
  couriers,
  fleets,
}: {
  couriers: CourierVM[];
  fleets: FleetVM[];
}) {
  const [doneCouriers, setDoneCouriers] = useState<Record<string, Decision>>({});
  const [doneFleets, setDoneFleets] = useState<Record<string, Decision>>({});

  const pendingCouriers = couriers.filter((c) => !doneCouriers[c.userId]);
  const pendingFleets = fleets.filter((f) => !doneFleets[f.fleetId]);

  return (
    <div className="flex flex-col gap-8">
      {/* Fleets first — a fleet must be legit before its couriers matter. */}
      <section className="flex flex-col gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-hir-muted-fg">
          <Building2 className="h-4 w-4" aria-hidden />
          Firme (KYF) · {pendingFleets.length}
        </h2>
        {pendingFleets.length === 0 ? (
          <EmptyState label="Nicio firmă în așteptare." />
        ) : (
          pendingFleets.map((f) => (
            <FleetCard
              key={f.fleetId}
              fleet={f}
              onDone={(d) => setDoneFleets((m) => ({ ...m, [f.fleetId]: d }))}
            />
          ))
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-hir-muted-fg">
          <User className="h-4 w-4" aria-hidden />
          Curieri (KYC) · {pendingCouriers.length}
        </h2>
        {pendingCouriers.length === 0 ? (
          <EmptyState label="Niciun curier în așteptare." />
        ) : (
          pendingCouriers.map((c) => (
            <CourierCard
              key={c.userId}
              courier={c}
              onDone={(d) => setDoneCouriers((m) => ({ ...m, [c.userId]: d }))}
            />
          ))
        )}
      </section>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <p className="rounded-xl border border-dashed border-hir-border bg-hir-bg/40 px-4 py-6 text-center text-sm text-hir-muted-fg">
      {label}
    </p>
  );
}

function DocLink({ label, url }: { label: string; url: string | null }) {
  if (!url) {
    return (
      <span className="inline-flex items-center gap-1 rounded-lg border border-hir-border bg-hir-bg/40 px-2.5 py-1 text-[11px] text-hir-muted-fg">
        {label}: lipsă
      </span>
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 rounded-lg border border-hir-border bg-hir-bg px-2.5 py-1 text-[11px] font-medium text-violet-300 hover:bg-hir-border/30"
    >
      {label}
      <ExternalLink className="h-3 w-3" aria-hidden />
    </a>
  );
}

/** Approve / reject controls shared by both card types. */
function DecisionControls({
  onDecide,
}: {
  onDecide: (decision: Decision, reason?: string) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');

  function approve() {
    setError(null);
    start(async () => {
      const r = await onDecide('VERIFIED');
      if (!r.ok) setError(r.error ?? 'Eroare.');
    });
  }

  function confirmReject() {
    setError(null);
    if (!reason.trim()) {
      setError('Adaugă motivul respingerii.');
      return;
    }
    start(async () => {
      const r = await onDecide('REJECTED', reason.trim());
      if (!r.ok) setError(r.error ?? 'Eroare.');
    });
  }

  if (rejecting) {
    return (
      <div className="flex flex-col gap-2">
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          placeholder="Motivul respingerii (vizibil pentru solicitant)…"
          className="w-full rounded-lg border border-hir-border bg-hir-bg px-3 py-2 text-sm text-hir-fg placeholder:text-hir-muted-fg focus:border-rose-500 focus:outline-none"
        />
        <div className="flex gap-2">
          <Button
            type="button"
            variant="destructive"
            disabled={pending}
            onClick={confirmReject}
            className="gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold"
          >
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <X className="h-3.5 w-3.5" aria-hidden />}
            Confirmă respingerea
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => setRejecting(false)}
            className="rounded-lg border-hir-border bg-hir-surface px-3 py-1.5 text-xs text-hir-fg hover:bg-hir-border"
          >
            Anulează
          </Button>
        </div>
        {error ? <p className="text-xs text-rose-400">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        disabled={pending}
        onClick={approve}
        className="gap-1 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-400"
      >
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Check className="h-3.5 w-3.5" aria-hidden />}
        Aprobă
      </Button>
      <Button
        type="button"
        variant="outline"
        disabled={pending}
        onClick={() => setRejecting(true)}
        className="gap-1 rounded-lg border-hir-border bg-hir-surface px-3 py-1.5 text-xs text-hir-fg hover:bg-hir-border"
      >
        <X className="h-3.5 w-3.5" aria-hidden />
        Respinge
      </Button>
      {error ? <p className="text-xs text-rose-400">{error}</p> : null}
    </div>
  );
}

function CourierCard({ courier, onDone }: { courier: CourierVM; onDone: (d: Decision) => void }) {
  return (
    <article className="rounded-2xl border border-hir-border bg-hir-surface/40 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-hir-fg">
            {courierDisplayName(courier.fleetPrefix, courier.legalName || courier.fullName)}
          </p>
          <p className="mt-0.5 text-xs text-hir-muted-fg">
            {courier.fleetName ? `${courier.fleetName} · ` : ''}
            {courier.city ?? 'oraș nespecificat'}
            {courier.cnpLast4 ? ` · CNP …${courier.cnpLast4}` : ''}
          </p>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-hir-bg px-2 py-0.5 text-[11px] text-hir-muted-fg">
          <Bike className="h-3 w-3" aria-hidden />
          {courier.vehicleType ?? '—'}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <DocLink label="Act identitate" url={courier.idDocUrl} />
        <DocLink label="Selfie" url={courier.selfieUrl} />
      </div>
      {!courier.idDocUrl && !courier.selfieUrl ? (
        <p className="mt-2 text-[11px] text-amber-300">
          Curierul nu a încărcat încă documentele de identitate.
        </p>
      ) : null}

      <p className="mt-2 text-[11px] text-hir-muted-fg">Trimis: {fmtDate(courier.submittedAt)}</p>

      <div className="mt-3">
        <DecisionControls
          onDecide={async (decision, reason) => {
            const r = await verifyCourierKyc(courier.userId, decision, reason);
            if (r.ok) onDone(decision);
            return r;
          }}
        />
      </div>
    </article>
  );
}

function FleetCard({ fleet, onDone }: { fleet: FleetVM; onDone: (d: Decision) => void }) {
  const caenMismatch = fleet.caenCode && fleet.caenCode !== '5320';
  return (
    <article className="rounded-2xl border border-hir-border bg-hir-surface/40 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="flex items-center gap-1.5 text-sm font-semibold text-hir-fg">
            <ShieldCheck className="h-4 w-4 text-violet-400" aria-hidden />
            {fleet.companyName || fleet.fleetName || 'Firmă'}
          </p>
          <p className="mt-0.5 text-xs text-hir-muted-fg">
            {fleet.cui ? `CUI ${fleet.cui}` : 'fără CUI'}
            {fleet.regCom ? ` · ${fleet.regCom}` : ''}
            {fleet.caenCode ? ` · CAEN ${fleet.caenCode}` : ''}
          </p>
        </div>
        {fleet.anafActive === false ? (
          <span className="rounded-full bg-rose-500/10 px-2 py-0.5 text-[11px] font-semibold text-rose-300">
            ANAF: inactivă
          </span>
        ) : fleet.anafActive ? (
          <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-300">
            ANAF: activă
          </span>
        ) : null}
      </div>

      {fleet.address ? (
        <p className="mt-1 text-[11px] text-hir-muted-fg">{fleet.address}</p>
      ) : null}
      {caenMismatch ? (
        <p className="mt-1 text-[11px] text-amber-300">CAEN ≠ 5320 (curierat) — verifică obiectul de activitate.</p>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        <DocLink label="Act constitutiv" url={fleet.actUrl} />
        <DocLink label="Extras de cont" url={fleet.extrasUrl} />
        <DocLink label="Certificat înreg." url={fleet.certificatUrl} />
      </div>

      <p className="mt-2 text-[11px] text-hir-muted-fg">Trimis: {fmtDate(fleet.submittedAt)}</p>

      <div className="mt-3">
        <DecisionControls
          onDecide={async (decision, reason) => {
            const r = await verifyFleetKyf(fleet.fleetId, decision, reason);
            if (r.ok) onDone(decision);
            return r;
          }}
        />
      </div>
    </article>
  );
}
