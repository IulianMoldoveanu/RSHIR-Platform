'use client';

import { useRef, useState } from 'react';
import { Check, FileText, Loader2, Shield, Upload, User } from 'lucide-react';
import { Button } from '@hir/ui';
import { getBrowserSupabase } from '@/lib/supabase/browser';
import { submitKycAction } from './actions';

type InitialKyc = {
  status: 'PENDING' | 'VERIFIED' | 'REJECTED';
  legalName: string;
  cui: string;
  rejectedReason: string | null;
} | null;

type SlotState = { uploading: boolean; path: string | null; error: string | null };

const EMPTY_SLOT: SlotState = { uploading: false, path: null, error: null };

/** Map submitKycAction error codes → Romanian user-facing messages. */
function kycErrorMessage(code: string | undefined): string {
  switch (code) {
    case 'not_a_courier':
      return 'Contul tău nu este încă un cont de curier. Contactează suportul.';
    case 'not_authenticated':
      return 'Sesiunea a expirat. Autentifică-te din nou și reîncearcă.';
    case 'invalid_name':
      return 'Introdu numele complet (ca în acte).';
    case 'db_error':
      return 'A apărut o problemă de server. Încearcă din nou în câteva momente.';
    default:
      return 'Nu am putut trimite documentele. Încearcă din nou.';
  }
}

/** Stable per-browser id (best-effort anti re-brokering signal). */
function getDeviceId(): string {
  if (typeof localStorage === 'undefined' || typeof crypto === 'undefined') return '';
  let id = localStorage.getItem('hir_device_id');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('hir_device_id', id);
  }
  return id;
}

function isHeic(file: File): boolean {
  const lower = (file.name || '').toLowerCase();
  return (
    file.type === 'image/heic' ||
    file.type === 'image/heif' ||
    lower.endsWith('.heic') ||
    lower.endsWith('.heif')
  );
}

export function KycForm({ userId, initial }: { userId: string; initial: InitialKyc }) {
  const [legalName, setLegalName] = useState(initial?.legalName ?? '');
  const [cui, setCui] = useState(initial?.cui ?? '');
  const [idDoc, setIdDoc] = useState<SlotState>(EMPTY_SLOT);
  const [selfie, setSelfie] = useState<SlotState>(EMPTY_SLOT);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Already verified → nothing to do.
  if (initial?.status === 'VERIFIED') {
    return (
      <section className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-5 text-sm text-emerald-200">
        <div className="flex items-center gap-2 font-semibold">
          <Shield className="h-5 w-5" aria-hidden />
          Identitate verificată
        </div>
        <p className="mt-1 text-emerald-200/80">
          Contul tău este verificat. Mulțumim!
        </p>
      </section>
    );
  }

  // Just submitted (or already PENDING and not re-submitting) → in-review state.
  if (submitted) {
    return (
      <section className="rounded-2xl border border-violet-500/40 bg-violet-500/10 p-5 text-sm text-violet-100">
        <div className="flex items-center gap-2 font-semibold">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
          Documente trimise
        </div>
        <p className="mt-1 text-violet-100/80">
          Verificăm documentele tale. Primești o notificare când contul este verificat.
        </p>
      </section>
    );
  }

  async function upload(file: File, slot: 'id' | 'selfie', set: (s: SlotState) => void) {
    set({ uploading: true, path: null, error: null });
    try {
      if (isHeic(file)) {
        throw new Error(
          'Format HEIC neacceptat. Schimbă din Setări iPhone → Cameră → Formate → „Cel mai compatibil" sau alege o poză JPG/PNG.',
        );
      }
      if (file.size > 6 * 1024 * 1024) {
        throw new Error('Fișier prea mare (max 6 MB).');
      }
      const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
      const path = `${userId}/${slot}-${Date.now()}.${ext}`;
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
    if (legalName.trim().length < 2) {
      setError('Introdu numele complet (ca în acte).');
      return;
    }
    if (!idDoc.path || !selfie.path) {
      setError('Încarcă atât actul de identitate, cât și selfie-ul.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await submitKycAction({
        legalName,
        cui: cui.trim() || null,
        idDocPath: idDoc.path,
        selfiePath: selfie.path,
        deviceFingerprint: getDeviceId() || null,
      });
      if (res.ok) {
        setSubmitted(true);
        return;
      }
      setError(kycErrorMessage(res.error));
    } catch {
      setError('Nu am putut trimite documentele. Încearcă din nou.');
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit =
    legalName.trim().length >= 2 && !!idDoc.path && !!selfie.path && !submitting;

  return (
    <div className="flex flex-col gap-4">
      {initial?.status === 'REJECTED' && (
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-200">
          <p className="font-semibold">Verificarea anterioară a fost respinsă.</p>
          {initial.rejectedReason && <p className="mt-1 text-rose-200/80">{initial.rejectedReason}</p>}
          <p className="mt-1 text-rose-200/80">Reîncarcă documentele și trimite din nou.</p>
        </div>
      )}
      {initial?.status === 'PENDING' && (
        <div className="rounded-xl border border-violet-500/40 bg-violet-500/10 p-4 text-sm text-violet-100">
          Documentele tale sunt în verificare. Poți trimite din nou dacă vrei să le actualizezi.
        </div>
      )}

      <div className="flex flex-col gap-2">
        <label htmlFor="kyc-name" className="text-sm font-medium text-hir-fg">
          Nume complet (ca în acte)
        </label>
        <input
          id="kyc-name"
          type="text"
          value={legalName}
          onChange={(e) => setLegalName(e.target.value)}
          autoComplete="name"
          className="h-11 rounded-lg border border-hir-border bg-hir-bg px-3 text-sm text-hir-fg placeholder:text-hir-muted-fg focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
          placeholder="Popescu Ion"
        />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="kyc-cui" className="text-sm font-medium text-hir-fg">
          CUI / CIF (opțional, dacă ești PFA/SRL)
        </label>
        <input
          id="kyc-cui"
          type="text"
          value={cui}
          onChange={(e) => setCui(e.target.value)}
          className="h-11 rounded-lg border border-hir-border bg-hir-bg px-3 text-sm text-hir-fg placeholder:text-hir-muted-fg focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
          placeholder="RO12345678"
        />
      </div>

      <UploadSlot
        label="Act de identitate"
        hint="Carte de identitate sau pașaport — foto clară."
        icon={<FileText className="h-5 w-5 text-violet-400" aria-hidden />}
        state={idDoc}
        onPick={(f) => upload(f, 'id', setIdDoc)}
      />
      <UploadSlot
        label="Selfie"
        hint="O poză cu fața ta, pentru a confirma identitatea."
        icon={<User className="h-5 w-5 text-violet-400" aria-hidden />}
        state={selfie}
        onPick={(f) => upload(f, 'selfie', setSelfie)}
      />

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
        pentru verificare.
      </p>
    </div>
  );
}

function UploadSlot({
  label,
  hint,
  icon,
  state,
  onPick,
}: {
  label: string;
  hint: string;
  icon: React.ReactNode;
  state: SlotState;
  onPick: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="rounded-xl border border-hir-border bg-hir-bg/40 p-4">
      <div className="flex items-center gap-2">
        {icon}
        <p className="text-sm font-medium text-hir-fg">{label}</p>
        {state.path && <Check className="ml-auto h-4 w-4 text-emerald-400" aria-hidden />}
      </div>
      <p className="mt-1 text-[11px] text-hir-muted-fg">{hint}</p>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
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
            <Upload className="h-4 w-4" aria-hidden /> Încarcă foto
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
