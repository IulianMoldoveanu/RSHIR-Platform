'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  FileText,
  Loader2,
  Search,
  Upload,
  User as UserIcon,
} from 'lucide-react';
import { getBrowserSupabase } from '@/lib/supabase/browser';
import type { AnafCompany } from '@/lib/anaf';
import { Card, buttonClass } from '@/app/_marketplace-ui';
import {
  lookupAnafPfaAction,
  submitPfaOnboardingAction,
  type PfaSubmitResult,
} from './actions';

// 3-step wizard for solo PFA onboarding. Mobile-first (HIR Curier app
// pattern: dark theme, violet brand, min 44px tap targets, focus rings).
//
//   Step 1: CUI (ANAF lookup auto-fills name) + display_name
//   Step 2: ID doc upload + selfie upload (storage path captured client-side)
//   Step 3: Confirm + agree T&C ARR (Art. 7 Legea 12/1990) + CAEN 4933/5320
//
// CAEN 4933 = "Transporturi cu taxiuri / curierat rutier de mărfuri" (use
// by motorcycle/car couriers operating in city) — and 5320 = "Alte activități
// poștale și de curier" (the canonical KYF gate). Both are accepted because
// the ONRC code a PFA holds may be either; admin oversight catches mismatch.

const CUI_RE = /^(RO)?\d{2,10}$/i;
const ACCEPTED_TYPES = 'image/jpeg,image/png,image/webp';

type Step = 1 | 2 | 3 | 'done';

type SlotState = { uploading: boolean; path: string | null; error: string | null };
const EMPTY_SLOT: SlotState = { uploading: false, path: null, error: null };

function isHeic(file: File): boolean {
  const lower = (file.name || '').toLowerCase();
  return (
    file.type === 'image/heic' ||
    file.type === 'image/heif' ||
    lower.endsWith('.heic') ||
    lower.endsWith('.heif')
  );
}

function extFor(file: File): string {
  if (file.type === 'image/png') return 'png';
  if (file.type === 'image/webp') return 'webp';
  return 'jpg';
}

export function PfaSignupForm({
  userId,
  userEmail,
}: {
  userId: string;
  userEmail: string;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);

  // Step 1 state
  const [cui, setCui] = useState('');
  const [anaf, setAnaf] = useState<AnafCompany | null>(null);
  const [anafLoading, setAnafLoading] = useState(false);
  const [anafError, setAnafError] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState('');

  // Step 2 state — storage paths captured after each upload
  const [idDoc, setIdDoc] = useState<SlotState>(EMPTY_SLOT);
  const [selfie, setSelfie] = useState<SlotState>(EMPTY_SLOT);

  // Step 3 state
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState(userEmail);
  const [agreeArr, setAgreeArr] = useState(false);
  const [agreeCaen, setAgreeCaen] = useState(false);

  // Global submit state
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // ───────────────────────────── Step 1 ─────────────────────────────
  async function verifyAnaf() {
    setAnafError(null);
    if (!CUI_RE.test(cui.trim())) {
      setAnafError('CUI invalid. Format: RO12345678 sau 12345678.');
      return;
    }
    setAnafLoading(true);
    try {
      const res = await lookupAnafPfaAction(cui);
      if (res.ok) {
        setAnaf(res.company);
        // Pre-fill display name with ANAF brand if user hasn't typed one.
        if (displayName.trim().length === 0) {
          setDisplayName(res.company.name);
        }
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

  const canAdvanceStep1 =
    !!anaf &&
    anaf.active &&
    displayName.trim().length >= 2 &&
    displayName.trim().length <= 100;

  // ───────────────────────────── Step 2 ─────────────────────────────
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
      // Path namespaced under user.id so RLS on the bucket (same `courier-kyc`
      // bucket the courier KYC uses) keeps the upload private to this user.
      const path = `${userId}/pfa-${slot}-${Date.now()}.${extFor(file)}`;
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

  const canAdvanceStep2 = !!idDoc.path && !!selfie.path;

  // ───────────────────────────── Step 3 ─────────────────────────────
  const canSubmit =
    canAdvanceStep1 &&
    canAdvanceStep2 &&
    phone.replace(/\D/g, '').length >= 9 &&
    email.trim().length > 3 &&
    agreeArr &&
    agreeCaen &&
    !submitting;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitError(null);
    setSubmitting(true);
    try {
      // The wizard state guarantees both paths are set when canSubmit is
      // true — the cast below is safe at the call site, but the action also
      // re-validates server-side.
      const res: PfaSubmitResult = await submitPfaOnboardingAction({
        cui: cui.trim(),
        displayName: displayName.trim(),
        idDocPath: idDoc.path ?? '',
        selfiePath: selfie.path ?? '',
        email: email.trim(),
        phone: phone.trim(),
      });
      if (res.ok) {
        setStep('done');
        // Pre-fetch the PFA dashboard so the next click is instant.
        router.prefetch('/pfa-dashboard');
        return;
      }
      setSubmitError(res.error);
    } catch {
      setSubmitError('Eroare neașteptată. Încearcă din nou.');
    } finally {
      setSubmitting(false);
    }
  }

  // ───────────────────────────── Done ─────────────────────────────
  if (step === 'done') {
    return (
      <section className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-5 text-sm text-emerald-200">
        <div className="flex items-center gap-2 text-base font-semibold text-emerald-100">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 ring-1 ring-emerald-500/40">
            <Check className="h-5 w-5" aria-hidden strokeWidth={2.25} />
          </span>
          PFA înrolat cu succes
        </div>
        <p className="mt-3 text-emerald-200/90">
          Ai propria flotă (un singur membru — tu). Poți accepta curse din piață
          imediat ce setezi disponibilitatea.
        </p>
        <button
          type="button"
          onClick={() => router.push('/pfa-dashboard')}
          className={buttonClass('primary', 'md', 'mt-4 min-h-[44px] w-full')}
        >
          Deschide panoul PFA
        </button>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <StepIndicator step={step} />

      {step === 1 ? (
        <Card accent className="flex flex-col gap-4 p-5">
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-violet-300" aria-hidden strokeWidth={1.75} />
            <h2 className="text-sm font-semibold text-hir-fg">Pasul 1 — CUI și nume PFA</h2>
          </div>
          <p className="text-xs text-hir-muted-fg">
            Introdu CUI-ul PFA și apasă „Verifică ANAF&rdquo;. Preluăm automat
            denumirea oficială.
          </p>

          <div className="flex flex-col gap-2">
            <label htmlFor="pfa-cui" className="text-xs font-medium text-hir-fg">
              CUI PFA *
            </label>
            <div className="flex gap-2">
              <input
                id="pfa-cui"
                type="text"
                value={cui}
                onChange={(e) => setCui(e.target.value.trim())}
                placeholder="RO46864293"
                maxLength={12}
                inputMode="text"
                autoComplete="off"
                className="min-h-[44px] flex-1 rounded-lg border border-hir-border bg-hir-bg px-3 text-sm text-hir-fg placeholder:text-hir-muted-fg focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
              />
              <button
                type="button"
                onClick={verifyAnaf}
                disabled={anafLoading || !cui.trim()}
                className={buttonClass('primary', 'sm', 'min-h-[44px]')}
              >
                {anafLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    Caut…
                  </>
                ) : (
                  <>
                    <Search className="h-4 w-4" aria-hidden strokeWidth={1.75} />
                    Verifică ANAF
                  </>
                )}
              </button>
            </div>
            {anafError ? (
              <p className="text-xs text-rose-400" role="alert" aria-live="polite">
                {anafError}
              </p>
            ) : null}
            {anaf ? (
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-200">
                <p className="font-semibold">{anaf.name}</p>
                {anaf.address ? <p className="mt-0.5">{anaf.address}</p> : null}
                <p className="mt-1 flex flex-wrap gap-2">
                  <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 font-semibold">
                    ANAF: {anaf.active ? 'activ' : 'inactiv'}
                  </span>
                  {anaf.caenCode ? (
                    <span className="rounded-full bg-violet-500/20 px-2 py-0.5 font-semibold text-violet-200">
                      CAEN {anaf.caenCode}
                    </span>
                  ) : null}
                </p>
              </div>
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="pfa-name" className="text-xs font-medium text-hir-fg">
              Nume PFA afișat (cum apare în piață) *
            </label>
            <input
              id="pfa-name"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={100}
              placeholder="ex: Popescu Ion PFA"
              autoComplete="organization"
              className="min-h-[44px] rounded-lg border border-hir-border bg-hir-bg px-3 text-sm text-hir-fg placeholder:text-hir-muted-fg focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
            />
            <p className="text-[11px] text-hir-muted-fg">
              Vendorii văd acest nume când le ofertezi o cursă.
            </p>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="button"
              onClick={() => setStep(2)}
              disabled={!canAdvanceStep1}
              className={buttonClass('primary', 'md', 'min-h-[44px] px-5')}
            >
              Continuă
              <ArrowRight className="h-4 w-4" aria-hidden strokeWidth={1.75} />
            </button>
          </div>
        </Card>
      ) : null}

      {step === 2 ? (
        <Card accent className="flex flex-col gap-4 p-5">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-violet-300" aria-hidden strokeWidth={1.75} />
            <h2 className="text-sm font-semibold text-hir-fg">
              Pasul 2 — Act identitate + selfie
            </h2>
          </div>
          <p className="text-xs text-hir-muted-fg">
            Carte de identitate + selfie clar. Stocate criptat, văzute doar de echipa HIR.
          </p>

          <UploadSlot
            label="Carte de identitate"
            hint="O poză clară a buletinului (față). JPG / PNG / WEBP, max 6 MB."
            icon={<FileText className="h-5 w-5 text-violet-400" aria-hidden strokeWidth={1.75} />}
            state={idDoc}
            onPick={(f) => upload(f, 'id', setIdDoc)}
          />
          <UploadSlot
            label="Selfie"
            hint="O poză cu fața ta, pentru a confirma identitatea."
            icon={<UserIcon className="h-5 w-5 text-violet-400" aria-hidden strokeWidth={1.75} />}
            state={selfie}
            onPick={(f) => upload(f, 'selfie', setSelfie)}
          />

          <div className="flex justify-between gap-2 pt-2">
            <button
              type="button"
              onClick={() => setStep(1)}
              className={buttonClass('secondary', 'md', 'min-h-[44px]')}
            >
              <ArrowLeft className="h-4 w-4" aria-hidden strokeWidth={1.75} />
              Înapoi
            </button>
            <button
              type="button"
              onClick={() => setStep(3)}
              disabled={!canAdvanceStep2}
              className={buttonClass('primary', 'md', 'min-h-[44px] px-5')}
            >
              Continuă
              <ArrowRight className="h-4 w-4" aria-hidden strokeWidth={1.75} />
            </button>
          </div>
        </Card>
      ) : null}

      {step === 3 ? (
        <Card accent className="flex flex-col gap-4 p-5">
          <div className="flex items-center gap-2">
            <Check className="h-5 w-5 text-violet-300" aria-hidden strokeWidth={1.75} />
            <h2 className="text-sm font-semibold text-hir-fg">
              Pasul 3 — Confirmare & acord
            </h2>
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="pfa-phone" className="text-xs font-medium text-hir-fg">
              Telefon *
            </label>
            <input
              id="pfa-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+40 743 700 916"
              autoComplete="tel"
              className="min-h-[44px] rounded-lg border border-hir-border bg-hir-bg px-3 text-sm text-hir-fg placeholder:text-hir-muted-fg focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="pfa-email" className="text-xs font-medium text-hir-fg">
              Email contact *
            </label>
            <input
              id="pfa-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              className="min-h-[44px] rounded-lg border border-hir-border bg-hir-bg px-3 text-sm text-hir-fg placeholder:text-hir-muted-fg focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
            />
          </div>

          <div className="rounded-xl border border-hir-border bg-hir-bg/40 p-3 text-xs text-hir-muted-fg">
            <p className="font-semibold text-hir-fg">Sumar PFA</p>
            <p className="mt-1">
              <span className="text-hir-muted-fg">CUI:</span>{' '}
              <span className="text-hir-fg">{cui || '—'}</span>
            </p>
            <p>
              <span className="text-hir-muted-fg">Denumire ANAF:</span>{' '}
              <span className="text-hir-fg">{anaf?.name ?? '—'}</span>
            </p>
            <p>
              <span className="text-hir-muted-fg">Nume afișat:</span>{' '}
              <span className="text-hir-fg">{displayName || '—'}</span>
            </p>
            {anaf?.caenCode ? (
              <p>
                <span className="text-hir-muted-fg">CAEN ANAF:</span>{' '}
                <span className="text-hir-fg">{anaf.caenCode}</span>
              </p>
            ) : null}
          </div>

          <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-hir-border bg-hir-bg/40 p-3 text-xs leading-relaxed text-hir-fg">
            <input
              type="checkbox"
              checked={agreeArr}
              onChange={(e) => setAgreeArr(e.target.checked)}
              className="mt-0.5 h-5 w-5 shrink-0 rounded border-hir-border bg-hir-bg text-violet-500 focus:ring-2 focus:ring-violet-500/30"
            />
            <span>
              Confirm că sunt PFA activ înregistrat la <strong>Registrul Comerțului (ARR)</strong>{' '}
              și că informațiile de mai sus sunt corecte. Sunt de acord cu{' '}
              <a
                href="/terms"
                className="underline-offset-2 hover:underline text-violet-300"
                target="_blank"
                rel="noopener noreferrer"
              >
                Termenii și condițiile HIR
              </a>{' '}
              și cu{' '}
              <a
                href="/privacy"
                className="underline-offset-2 hover:underline text-violet-300"
                target="_blank"
                rel="noopener noreferrer"
              >
                Politica de confidențialitate
              </a>
              .
            </span>
          </label>

          <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-hir-border bg-hir-bg/40 p-3 text-xs leading-relaxed text-hir-fg">
            <input
              type="checkbox"
              checked={agreeCaen}
              onChange={(e) => setAgreeCaen(e.target.checked)}
              className="mt-0.5 h-5 w-5 shrink-0 rounded border-hir-border bg-hir-bg text-violet-500 focus:ring-2 focus:ring-violet-500/30"
            />
            <span>
              Confirm că PFA-ul meu are codul <strong>CAEN 4933</strong> („Transporturi cu
              taxiuri&rdquo;) sau <strong>CAEN 5320</strong> („Alte activități poștale și de
              curier&rdquo;) autorizat la ONRC pentru această activitate.
            </span>
          </label>

          {submitError ? (
            <p
              className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-300"
              role="alert"
              aria-live="polite"
            >
              {submitError}
            </p>
          ) : null}

          <div className="flex justify-between gap-2 pt-2">
            <button
              type="button"
              onClick={() => setStep(2)}
              disabled={submitting}
              className={buttonClass('secondary', 'md', 'min-h-[44px]')}
            >
              <ArrowLeft className="h-4 w-4" aria-hidden strokeWidth={1.75} />
              Înapoi
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit}
              className={buttonClass('primary', 'md', 'min-h-[44px] px-5')}
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  Se trimite…
                </>
              ) : (
                <>Trimite înrolarea</>
              )}
            </button>
          </div>
        </Card>
      ) : null}
    </div>
  );
}

function StepIndicator({ step }: { step: Step }) {
  const stepNum = step === 'done' ? 3 : step;
  return (
    <ol className="flex items-center gap-2">
      {[1, 2, 3].map((n) => {
        const done = stepNum > n;
        const active = stepNum === n;
        return (
          <li key={n} className="flex flex-1 items-center gap-2">
            <span
              aria-current={active ? 'step' : undefined}
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
                done
                  ? 'bg-emerald-500 text-white'
                  : active
                    ? 'bg-violet-500 text-white ring-2 ring-violet-500/30'
                    : 'bg-hir-bg text-hir-muted-fg ring-1 ring-hir-border'
              }`}
            >
              {done ? <Check className="h-3.5 w-3.5" aria-hidden /> : n}
            </span>
            {n < 3 ? (
              <span
                className={`h-0.5 flex-1 rounded-full ${
                  done ? 'bg-emerald-500/60' : 'bg-hir-border'
                }`}
                aria-hidden
              />
            ) : null}
          </li>
        );
      })}
    </ol>
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
        {state.path ? (
          <Check className="ml-auto h-4 w-4 text-emerald-400" aria-hidden strokeWidth={1.75} />
        ) : null}
      </div>
      <p className="mt-1 text-[11px] text-hir-muted-fg">{hint}</p>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_TYPES}
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
        className={buttonClass('secondary', 'md', 'mt-3 min-h-[44px]')}
      >
        {state.uploading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Se încarcă…
          </>
        ) : state.path ? (
          <>
            <Check className="h-4 w-4 text-emerald-400" aria-hidden strokeWidth={1.75} /> Încărcat — schimbă
          </>
        ) : (
          <>
            <Upload className="h-4 w-4" aria-hidden strokeWidth={1.75} /> Încarcă foto
          </>
        )}
      </button>
      {state.error ? (
        <p className="mt-2 text-xs text-rose-400" role="alert" aria-live="polite">
          {state.error}
        </p>
      ) : null}
    </div>
  );
}
