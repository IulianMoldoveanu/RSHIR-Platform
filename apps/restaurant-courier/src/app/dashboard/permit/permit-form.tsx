'use client';

// Stream 7 — courier permit upload + status form.
// Mirrors the KYC form pattern in this app: storage upload via the browser
// Supabase client to the same private bucket (courier-kyc, prefixed
// permits/<userId>/ to keep the doc separate from id/selfie), then a server
// action that writes the four scalar fields to public.courier_profiles.

import { useRef, useState } from 'react';
import { Check, FileCheck, Loader2, Upload } from 'lucide-react';
import { Button } from '@hir/ui';
import { getBrowserSupabase } from '@/lib/supabase/browser';
import { submitPermitAction } from './actions';

export type PermitInitial = {
  isNonEu: boolean;
  status: 'PENDING' | 'VERIFIED' | 'REJECTED' | 'EXPIRED';
  countryIso: string;
  validUntil: string; // YYYY-MM-DD or ''
  docPath: string | null;
  verifiedAt: string | null;
};

type SlotState = { uploading: boolean; path: string | null; error: string | null };
const EMPTY_SLOT: SlotState = { uploading: false, path: null, error: null };

const STATUS_BADGE: Record<
  PermitInitial['status'],
  { label: string; cls: string }
> = {
  PENDING: {
    label: 'În verificare',
    cls: 'bg-violet-500/15 text-violet-200 ring-violet-500/30',
  },
  VERIFIED: {
    label: 'Verificat',
    cls: 'bg-emerald-500/15 text-emerald-200 ring-emerald-500/30',
  },
  REJECTED: {
    label: 'Respins',
    cls: 'bg-rose-500/15 text-rose-200 ring-rose-500/30',
  },
  EXPIRED: {
    label: 'Expirat',
    cls: 'bg-amber-500/15 text-amber-200 ring-amber-500/30',
  },
};

function permitErrorMessage(code: string | undefined): string {
  switch (code) {
    case 'not_authenticated':
      return 'Sesiunea a expirat. Reconectează-te și reîncearcă.';
    case 'feature_not_enabled':
      return 'Verificarea permisului nu este activă momentan.';
    case 'profile_not_found':
      return 'Profilul tău de curier nu există încă. Contactează suportul.';
    case 'country_iso_invalid':
      return 'Codul de țară trebuie să fie ISO 3166-1 alfa-3 (ex: NPL, IND, UKR).';
    case 'valid_until_invalid':
      return 'Data de valabilitate trebuie să fie în viitor.';
    case 'doc_required':
      return 'Încarcă scanul permisului înainte de a trimite.';
    case 'db_error':
      return 'Eroare la salvare. Încearcă din nou.';
    default:
      return 'Nu am putut trimite cererea. Încearcă din nou.';
  }
}

function fmtDateRo(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('ro-RO', { dateStyle: 'medium' });
}

function daysUntil(iso: string): number | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const ms = d.getTime() - Date.now();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

export function PermitForm({
  userId,
  initial,
}: {
  userId: string;
  initial: PermitInitial;
}) {
  const [countryIso, setCountryIso] = useState(initial.countryIso);
  const [validUntil, setValidUntil] = useState(initial.validUntil);
  const [doc, setDoc] = useState<SlotState>({
    uploading: false,
    path: initial.docPath,
    error: null,
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const badge = STATUS_BADGE[initial.status];
  const daysLeft =
    initial.status === 'VERIFIED' && initial.validUntil
      ? daysUntil(initial.validUntil)
      : null;

  async function upload(file: File, set: (s: SlotState) => void) {
    set({ uploading: true, path: null, error: null });
    try {
      if (file.size > 6 * 1024 * 1024) {
        throw new Error('Fișier prea mare (max 6 MB).');
      }
      const ext =
        file.type === 'image/png'
          ? 'png'
          : file.type === 'application/pdf'
            ? 'pdf'
            : file.type === 'image/webp'
              ? 'webp'
              : 'jpg';
      // Storage path lives under the same courier-kyc bucket as id/selfie but
      // under a permits/ prefix so the audit reviewer can spot it at a glance.
      const path = `permits/${userId}/permit-${Date.now()}.${ext}`;
      const supa = getBrowserSupabase();
      const { error: upErr } = await supa.storage
        .from('courier-kyc')
        .upload(path, file, { contentType: file.type, upsert: true });
      if (upErr) throw upErr;
      set({ uploading: false, path, error: null });
    } catch (err) {
      set({
        uploading: false,
        path: null,
        error: err instanceof Error ? err.message : 'Eroare la încărcare.',
      });
    }
  }

  async function handleSubmit() {
    if (submitting) return;
    setError(null);
    const trimmedIso = countryIso.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(trimmedIso)) {
      setError(permitErrorMessage('country_iso_invalid'));
      return;
    }
    if (!validUntil) {
      setError(permitErrorMessage('valid_until_invalid'));
      return;
    }
    const validUntilMs = Date.parse(validUntil);
    if (!Number.isFinite(validUntilMs) || validUntilMs <= Date.now()) {
      setError(permitErrorMessage('valid_until_invalid'));
      return;
    }
    if (!doc.path) {
      setError(permitErrorMessage('doc_required'));
      return;
    }
    setSubmitting(true);
    try {
      const res = await submitPermitAction({
        countryIso: trimmedIso,
        validUntil,
        docPath: doc.path,
      });
      if (res.ok) {
        setSubmitted(true);
        return;
      }
      setError(permitErrorMessage(res.error));
    } catch {
      setError(permitErrorMessage(undefined));
    } finally {
      setSubmitting(false);
    }
  }

  // Already verified + still in date → no form, just status panel + resubmit
  // button (a verified courier may want to upload a renewed permit).
  if (initial.status === 'VERIFIED' && !submitted) {
    return (
      <section className="flex flex-col gap-4">
        <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-5 text-sm text-emerald-100">
          <div className="flex items-center gap-2 font-semibold">
            <FileCheck className="h-5 w-5" aria-hidden />
            Permis verificat
          </div>
          <p className="mt-1 text-emerald-100/80">
            Țara emitentă: <strong>{initial.countryIso || '—'}</strong>
          </p>
          <p className="mt-1 text-emerald-100/80">
            Valabil până la <strong>{fmtDateRo(initial.validUntil)}</strong>
            {daysLeft !== null ? (
              <>
                {' '}
                ({daysLeft >= 0 ? `${daysLeft} zile rămase` : `expirat acum ${-daysLeft} zile`})
              </>
            ) : null}
          </p>
          {initial.verifiedAt ? (
            <p className="mt-1 text-emerald-100/80">
              Verificat la {fmtDateRo(initial.verifiedAt)}.
            </p>
          ) : null}
        </div>
        <details className="rounded-xl border border-hir-border bg-hir-bg/40 p-4">
          <summary className="cursor-pointer text-sm font-medium text-hir-fg">
            Permisul a fost reînnoit? Trimite-l pentru re-verificare
          </summary>
          <div className="mt-3">
            <PermitFormFields
              countryIso={countryIso}
              setCountryIso={setCountryIso}
              validUntil={validUntil}
              setValidUntil={setValidUntil}
              doc={doc}
              onUpload={(f) => upload(f, setDoc)}
              error={error}
              submitting={submitting}
              onSubmit={handleSubmit}
              ctaLabel="Trimite re-verificare"
            />
          </div>
        </details>
      </section>
    );
  }

  if (submitted) {
    return (
      <section className="rounded-2xl border border-violet-500/40 bg-violet-500/10 p-5 text-sm text-violet-100">
        <div className="flex items-center gap-2 font-semibold">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
          Documentele tale sunt în verificare
        </div>
        <p className="mt-1 text-violet-100/80">
          Echipa HIR îți verifică permisul. Primești o notificare când statutul se
          schimbă.
        </p>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-4">
      <div
        className={`flex items-center justify-between rounded-xl border bg-hir-bg/40 px-4 py-3 text-sm ring-1 ring-inset ${badge.cls}`}
      >
        <span className="font-semibold">Stare actuală</span>
        <span className="rounded-full px-2 py-0.5 text-xs font-semibold">
          {badge.label}
        </span>
      </div>

      {initial.status === 'EXPIRED' ? (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-100">
          Permisul a expirat (era valabil până la {fmtDateRo(initial.validUntil)}).
          Încarcă noul permis pentru a continua să livrezi.
        </div>
      ) : null}

      {initial.status === 'REJECTED' ? (
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-200">
          Verificarea anterioară a fost respinsă. Verifică documentele și trimite din
          nou.
        </div>
      ) : null}

      <PermitFormFields
        countryIso={countryIso}
        setCountryIso={setCountryIso}
        validUntil={validUntil}
        setValidUntil={setValidUntil}
        doc={doc}
        onUpload={(f) => upload(f, setDoc)}
        error={error}
        submitting={submitting}
        onSubmit={handleSubmit}
        ctaLabel="Trimite spre verificare"
      />

      <p className="text-[11px] text-hir-muted-fg">
        Documentele sunt stocate criptat, într-un spațiu privat, și sunt văzute doar de
        echipa HIR pentru verificare. Flota nu vede scanul; vede doar statutul de
        valabilitate.
      </p>
    </section>
  );
}

function PermitFormFields({
  countryIso,
  setCountryIso,
  validUntil,
  setValidUntil,
  doc,
  onUpload,
  error,
  submitting,
  onSubmit,
  ctaLabel,
}: {
  countryIso: string;
  setCountryIso: (v: string) => void;
  validUntil: string;
  setValidUntil: (v: string) => void;
  doc: SlotState;
  onUpload: (file: File) => void;
  error: string | null;
  submitting: boolean;
  onSubmit: () => void;
  ctaLabel: string;
}) {
  const canSubmit =
    /^[A-Za-z]{3}$/.test(countryIso.trim()) &&
    !!validUntil &&
    !!doc.path &&
    !submitting;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label htmlFor="permit-iso" className="text-sm font-medium text-hir-fg">
          Țară emitentă (ISO 3166-1 alfa-3)
        </label>
        <input
          id="permit-iso"
          type="text"
          inputMode="text"
          maxLength={3}
          value={countryIso}
          onChange={(e) => setCountryIso(e.target.value.toUpperCase())}
          className="h-11 rounded-lg border border-hir-border bg-hir-bg px-3 text-sm uppercase text-hir-fg placeholder:text-hir-muted-fg focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
          placeholder="NPL"
        />
        <p className="text-[11px] text-hir-muted-fg">
          Ex: NPL (Nepal), IND (India), BGD (Bangladesh), PHL (Filipine), UKR
          (Ucraina), MDA (R. Moldova).
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="permit-validity" className="text-sm font-medium text-hir-fg">
          Valabil până la
        </label>
        <input
          id="permit-validity"
          type="date"
          value={validUntil}
          onChange={(e) => setValidUntil(e.target.value)}
          className="h-11 rounded-lg border border-hir-border bg-hir-bg px-3 text-sm text-hir-fg focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
        />
        <p className="text-[11px] text-hir-muted-fg">
          Data de expirare a permisului așa cum apare pe document.
        </p>
      </div>

      <PermitUploadSlot
        label="Scanul permisului"
        hint="JPG, PNG sau PDF, până la 6 MB."
        state={doc}
        onPick={onUpload}
      />

      {error ? (
        <p className="text-sm text-rose-400" role="alert">
          {error}
        </p>
      ) : null}

      <Button type="button" onClick={onSubmit} disabled={!canSubmit} className="h-12">
        {submitting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> Se trimite…
          </>
        ) : (
          ctaLabel
        )}
      </Button>
    </div>
  );
}

function PermitUploadSlot({
  label,
  hint,
  state,
  onPick,
}: {
  label: string;
  hint: string;
  state: SlotState;
  onPick: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="rounded-xl border border-hir-border bg-hir-bg/40 p-4">
      <div className="flex items-center gap-2">
        <FileCheck className="h-5 w-5 text-violet-400" aria-hidden />
        <p className="text-sm font-medium text-hir-fg">{label}</p>
        {state.path && <Check className="ml-auto h-4 w-4 text-emerald-400" aria-hidden />}
      </div>
      <p className="mt-1 text-[11px] text-hir-muted-fg">{hint}</p>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPick(f);
          if (inputRef.current) inputRef.current.value = '';
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={state.uploading}
        className="mt-3 inline-flex h-10 items-center gap-2 rounded-lg border border-hir-border bg-hir-bg px-4 text-sm font-medium text-hir-fg hover:bg-hir-border/30 disabled:opacity-50"
      >
        {state.uploading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Se încarcă…
          </>
        ) : state.path ? (
          <>
            <Check className="h-4 w-4 text-emerald-400" aria-hidden /> Încărcat — schimbă
          </>
        ) : (
          <>
            <Upload className="h-4 w-4" aria-hidden /> Încarcă document
          </>
        )}
      </button>
      {state.error && (
        <p className="mt-2 text-xs text-rose-400" role="alert">
          {state.error}
        </p>
      )}
    </div>
  );
}
