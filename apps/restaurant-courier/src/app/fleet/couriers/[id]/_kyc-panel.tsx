'use client';

import { useState, useTransition } from 'react';
import { Check, ExternalLink, Loader2, Shield, X } from 'lucide-react';
import { Button } from '@hir/ui';
import { verifyOwnCourierKycAction } from '../../actions';

export type KycPanelData = {
  status: 'PENDING' | 'VERIFIED' | 'REJECTED';
  idDocUrl: string | null;
  selfieUrl: string | null;
  rejectedReason: string | null;
  validatedBy: 'PLATFORM' | 'FLEET' | null;
} | null;

const STATUS_TONE: Record<'PENDING' | 'VERIFIED' | 'REJECTED', { label: string; tone: string }> = {
  PENDING: { label: 'În verificare', tone: 'bg-violet-500/10 text-violet-300' },
  VERIFIED: { label: 'Verificat', tone: 'bg-emerald-500/10 text-emerald-300' },
  REJECTED: { label: 'Respins', tone: 'bg-rose-500/10 text-rose-300' },
};

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

export function CourierKycPanel({
  courierUserId,
  canValidate,
  kyc,
}: {
  courierUserId: string;
  canValidate: boolean;
  kyc: KycPanelData;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  // Optimistic local status so the panel reflects the decision immediately.
  const [localStatus, setLocalStatus] = useState(kyc?.status ?? null);

  const status = localStatus;
  const badge = status ? STATUS_TONE[status] : null;

  function approve() {
    setError(null);
    start(async () => {
      const r = await verifyOwnCourierKycAction(courierUserId, 'VERIFIED');
      if (r.ok) setLocalStatus('VERIFIED');
      else setError(r.error);
    });
  }

  function confirmReject() {
    setError(null);
    if (!reason.trim()) {
      setError('Adaugă motivul respingerii.');
      return;
    }
    start(async () => {
      const r = await verifyOwnCourierKycAction(courierUserId, 'REJECTED', reason.trim());
      if (r.ok) {
        setLocalStatus('REJECTED');
        setRejecting(false);
      } else {
        setError(r.error);
      }
    });
  }

  return (
    <section className="rounded-2xl border border-hir-border bg-hir-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-hir-muted-fg">
          <Shield className="h-3.5 w-3.5 text-violet-400" aria-hidden />
          Identitate (KYC)
        </p>
        {badge ? (
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${badge.tone}`}>
            {badge.label}
          </span>
        ) : (
          <span className="rounded-full bg-hir-border px-2 py-0.5 text-[11px] font-semibold text-hir-muted-fg">
            Neînceput
          </span>
        )}
      </div>

      {!kyc ? (
        <p className="mt-2 text-xs text-hir-muted-fg">
          Curierul nu a trimis încă documentele de identitate.
        </p>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap gap-2">
            <DocLink label="Act identitate" url={kyc.idDocUrl} />
            <DocLink label="Selfie" url={kyc.selfieUrl} />
          </div>
          {status === 'REJECTED' && kyc.rejectedReason ? (
            <p className="mt-2 text-[11px] text-rose-300">Motiv respingere: {kyc.rejectedReason}</p>
          ) : null}
          {status === 'VERIFIED' && kyc.validatedBy ? (
            <p className="mt-2 text-[11px] text-hir-muted-fg">
              Validat de: {kyc.validatedBy === 'FLEET' ? 'flotă (răspundere proprie)' : 'platforma HIR'}
            </p>
          ) : null}
        </>
      )}

      {/* Decision controls only when the platform delegated validation. */}
      {canValidate ? (
        <div className="mt-4 border-t border-hir-border pt-3">
          {rejecting ? (
            <div className="flex flex-col gap-2">
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                placeholder="Motivul respingerii (vizibil pentru curier)…"
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
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                disabled={pending || !kyc}
                onClick={approve}
                className="gap-1 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-400 disabled:opacity-50"
              >
                {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Check className="h-3.5 w-3.5" aria-hidden />}
                Aprobă
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={pending || !kyc}
                onClick={() => setRejecting(true)}
                className="gap-1 rounded-lg border-hir-border bg-hir-surface px-3 py-1.5 text-xs text-hir-fg hover:bg-hir-border disabled:opacity-50"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
                Respinge
              </Button>
            </div>
          )}
          <p className="mt-2 text-[11px] text-amber-300/90">
            Prin aprobare confirmi identitatea curierului și flota își asumă responsabilitatea datelor lui.
          </p>
          {error ? <p className="mt-1 text-xs text-rose-400">{error}</p> : null}
        </div>
      ) : (
        <p className="mt-3 border-t border-hir-border pt-3 text-[11px] text-hir-muted-fg">
          Identitatea curierilor acestei flote este validată de platforma HIR.
        </p>
      )}
    </section>
  );
}
