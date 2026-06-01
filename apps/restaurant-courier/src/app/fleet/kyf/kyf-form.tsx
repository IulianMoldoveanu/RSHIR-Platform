'use client';

import { useRef, useState } from 'react';
import { Building2, Check, FileText, Loader2, Search, Shield } from 'lucide-react';
import { Button } from '@hir/ui';
import { getBrowserSupabase } from '@/lib/supabase/browser';
import { lookupAnafAction, submitKyfAction } from './actions';
import type { AnafCompany } from '@/lib/anaf';

type InitialKyf = {
  status: 'PENDING' | 'VERIFIED' | 'REJECTED';
  cui: string;
  companyName: string | null;
  caenCode: string | null;
  regCom: string | null;
  rejectedReason: string | null;
} | null;

type SlotState = { uploading: boolean; path: string | null; error: string | null };
const EMPTY_SLOT: SlotState = { uploading: false, path: null, error: null };

type DocSlot = 'act' | 'extras' | 'certificat';

const COURIER_CAEN = '5320';

function extFor(file: File): string {
  if (file.type === 'application/pdf') return 'pdf';
  if (file.type === 'image/png') return 'png';
  if (file.type === 'image/webp') return 'webp';
  return 'jpg';
}

export function KyfForm({ fleetId, initial }: { fleetId: string; initial: InitialKyf }) {
  const [cui, setCui] = useState(initial?.cui ?? '');
  const [anaf, setAnaf] = useState<AnafCompany | null>(
    initial?.companyName
      ? {
          cui: initial.cui,
          name: initial.companyName,
          address: null,
          regCom: initial.regCom,
          caenCode: initial.caenCode,
          vatPayer: false,
          active: true,
        }
      : null,
  );
  const [anafLoading, setAnafLoading] = useState(false);
  const [anafError, setAnafError] = useState<string | null>(null);
  const [act, setAct] = useState<SlotState>(EMPTY_SLOT);
  const [extras, setExtras] = useState<SlotState>(EMPTY_SLOT);
  const [certificat, setCertificat] = useState<SlotState>(EMPTY_SLOT);
  const [iban, setIban] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Already verified → read-only confirmation.
  if (initial?.status === 'VERIFIED') {
    return (
      <section className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-5 text-sm text-emerald-200">
        <div className="flex items-center gap-2 font-semibold">
          <Shield className="h-5 w-5" aria-hidden />
          Firmă verificată
        </div>
        <p className="mt-1 text-emerald-200/80">
          {initial.companyName ?? 'Firma ta'} este verificată. Mulțumim!
        </p>
      </section>
    );
  }

  if (submitted) {
    return (
      <section className="rounded-2xl border border-violet-500/40 bg-violet-500/10 p-5 text-sm text-violet-100">
        <div className="flex items-center gap-2 font-semibold">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
          Date trimise
        </div>
        <p className="mt-1 text-violet-100/80">
          Verificăm firma și documentele. Primești o notificare când flota este aprobată.
        </p>
      </section>
    );
  }

  async function verifyAnaf() {
    setAnafError(null);
    if (!cui.trim()) {
      setAnafError('Introdu CUI-ul firmei.');
      return;
    }
    setAnafLoading(true);
    try {
      const res = await lookupAnafAction(cui);
      if (res.ok) {
        setAnaf(res.company);
      } else {
        setAnaf(null);
        setAnafError(res.error);
      }
    } catch {
      setAnafError('Nu am putut contacta ANAF. Încearcă din nou.');
    } finally {
      setAnafLoading(false);
    }
  }

  async function upload(file: File, slot: DocSlot, set: (s: SlotState) => void) {
    set({ uploading: true, path: null, error: null });
    try {
      if (file.size > 10 * 1024 * 1024) {
        throw new Error('Fișier prea mare (max 10 MB).');
      }
      const path = `${fleetId}/${slot}-${Date.now()}.${extFor(file)}`;
      const supa = getBrowserSupabase();
      const { error: upErr } = await supa.storage
        .from('fleet-kyf')
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
    if (!cui.trim()) {
      setError('Introdu CUI-ul firmei.');
      return;
    }
    if (!act.path || !extras.path || !certificat.path) {
      setError('Încarcă toate cele 3 documente: act constitutiv, extras de cont, certificat de înregistrare.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await submitKyfAction({
        cui,
        companyName: anaf?.name ?? null,
        regCom: anaf?.regCom ?? null,
        caenCode: anaf?.caenCode ?? null,
        address: anaf?.address ?? null,
        vatPayer: anaf ? anaf.vatPayer : null,
        anafActive: anaf ? anaf.active : null,
        iban: iban.trim() || null,
        actConstitutivPath: act.path,
        extrasContPath: extras.path,
        certificatInregPath: certificat.path,
      });
      if (res.ok) {
        setSubmitted(true);
        return;
      }
      setError(res.error);
    } catch {
      setError('Nu am putut trimite datele. Încearcă din nou.');
    } finally {
      setSubmitting(false);
    }
  }

  const caenMismatch = anaf?.caenCode && anaf.caenCode !== COURIER_CAEN;
  const canSubmit =
    !!cui.trim() && !!act.path && !!extras.path && !!certificat.path && !submitting;

  return (
    <div className="flex flex-col gap-4">
      {initial?.status === 'REJECTED' && (
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-200">
          <p className="font-semibold">Verificarea anterioară a fost respinsă.</p>
          {initial.rejectedReason && <p className="mt-1 text-rose-200/80">{initial.rejectedReason}</p>}
          <p className="mt-1 text-rose-200/80">Corectează datele, reîncarcă documentele și trimite din nou.</p>
        </div>
      )}
      {initial?.status === 'PENDING' && (
        <div className="rounded-xl border border-violet-500/40 bg-violet-500/10 p-4 text-sm text-violet-100">
          Datele tale sunt în verificare. Poți trimite din nou dacă vrei să le actualizezi.
        </div>
      )}

      {/* CUI + ANAF lookup */}
      <div className="flex flex-col gap-2">
        <label htmlFor="kyf-cui" className="text-sm font-medium text-hir-fg">
          CUI / CIF
        </label>
        <div className="flex gap-2">
          <input
            id="kyf-cui"
            type="text"
            value={cui}
            onChange={(e) => setCui(e.target.value)}
            inputMode="numeric"
            autoComplete="off"
            className="h-11 flex-1 rounded-lg border border-hir-border bg-hir-bg px-3 text-sm text-hir-fg placeholder:text-hir-muted-fg focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
            placeholder="ex. 14399840"
          />
          <Button
            type="button"
            variant="outline"
            onClick={verifyAnaf}
            disabled={anafLoading}
            className="h-11 gap-2 border-hir-border bg-hir-surface text-hir-fg hover:bg-hir-border"
          >
            {anafLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Search className="h-4 w-4" aria-hidden />
            )}
            Verifică ANAF
          </Button>
        </div>
        {anafError && (
          <p className="text-xs text-amber-300" role="alert">
            {anafError}
          </p>
        )}
      </div>

      {/* ANAF autofill result */}
      {anaf && (
        <section className="rounded-xl border border-hir-border bg-hir-bg/40 p-4">
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-violet-400" aria-hidden />
            <p className="text-sm font-semibold text-hir-fg">{anaf.name || 'Firmă'}</p>
            {anaf.active ? (
              <span className="ml-auto rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-300">
                Activă
              </span>
            ) : (
              <span className="ml-auto rounded-full bg-rose-500/10 px-2 py-0.5 text-[11px] font-semibold text-rose-300">
                Inactivă / radiată
              </span>
            )}
          </div>
          <dl className="mt-3 grid grid-cols-1 gap-1.5 text-xs sm:grid-cols-2">
            <DataRow label="Nr. Reg. Com." value={anaf.regCom} />
            <DataRow label="Cod CAEN" value={anaf.caenCode} />
            <DataRow label="Plătitor TVA" value={anaf.vatPayer ? 'Da' : 'Nu'} />
            <DataRow label="Adresă" value={anaf.address} />
          </dl>
          {caenMismatch && (
            <p className="mt-2 text-[11px] text-amber-300">
              CAEN-ul nu pare a fi de curierat (5320). Verificarea o face echipa HIR.
            </p>
          )}
        </section>
      )}

      {/* Documents */}
      <UploadSlot
        label="Act constitutiv"
        hint="PDF sau foto clară."
        state={act}
        onPick={(f) => upload(f, 'act', setAct)}
      />
      <UploadSlot
        label="Extras de cont"
        hint="Cu IBAN-ul firmei vizibil."
        state={extras}
        onPick={(f) => upload(f, 'extras', setExtras)}
      />
      <UploadSlot
        label="Certificat de înregistrare"
        hint="Certificatul ONRC al firmei."
        state={certificat}
        onPick={(f) => upload(f, 'certificat', setCertificat)}
      />

      {/* IBAN (optional) */}
      <div className="flex flex-col gap-2">
        <label htmlFor="kyf-iban" className="text-sm font-medium text-hir-fg">
          IBAN (opțional)
        </label>
        <input
          id="kyf-iban"
          type="text"
          value={iban}
          onChange={(e) => setIban(e.target.value)}
          autoComplete="off"
          className="h-11 rounded-lg border border-hir-border bg-hir-bg px-3 text-sm uppercase text-hir-fg placeholder:text-hir-muted-fg focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
          placeholder="RO49 AAAA 1B31 0075 9384 0000"
        />
      </div>

      {error && (
        <p className="text-sm text-rose-400" role="alert">
          {error}
        </p>
      )}

      <Button type="button" onClick={handleSubmit} disabled={!canSubmit} className="h-12">
        {submitting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> Se trimite…
          </>
        ) : (
          'Trimite spre verificare'
        )}
      </Button>
      <p className="text-[11px] text-hir-muted-fg">
        Documentele sunt stocate criptat, într-un spațiu privat, și sunt văzute doar de echipa HIR
        pentru verificarea firmei.
      </p>
    </div>
  );
}

function DataRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex flex-col">
      <dt className="text-hir-muted-fg">{label}</dt>
      <dd className="text-hir-fg">{value ?? '—'}</dd>
    </div>
  );
}

function UploadSlot({
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
        <FileText className="h-5 w-5 text-violet-400" aria-hidden />
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
          'Încarcă document'
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
