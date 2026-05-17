'use client';

import { useEffect, useState } from 'react';
import { ShieldAlert, ShieldCheck } from 'lucide-react';
import { classifyExpiry, readDocs } from '@/lib/courier-documents';

/**
 * Compact status pill that surfaces whether the courier's mandatory
 * documents (DL + RCA + ITP) are all valid today. Lives at the top of
 * the orders page so the answer to "am voie să livrez azi?" is one
 * glance away — without needing to open Setări → Profil → Documente.
 *
 * Hidden when no doc dates have been entered yet (avoids nagging brand-
 * new accounts).
 */
type Verdict = 'unknown' | 'ok' | 'attention' | 'blocking';

export function InsuranceStatusPill() {
  const [hydrated, setHydrated] = useState(false);
  const [verdict, setVerdict] = useState<Verdict>('unknown');
  const [summary, setSummary] = useState<string>('');

  useEffect(() => {
    const docs = readDocs();
    const anyKnown = Boolean(docs.dl || docs.rca || docs.itp);
    if (!anyKnown) {
      setVerdict('unknown');
      setHydrated(true);
      return;
    }

    const dl = classifyExpiry(docs.dl).state;
    const rca = classifyExpiry(docs.rca).state;
    const itp = classifyExpiry(docs.itp).state;

    const allValid = [dl, rca, itp].every((s) => s === 'ok' || s === 'warning');
    const anyExpired = [dl, rca, itp].some((s) => s === 'expired');
    const anyCritical = [dl, rca, itp].some((s) => s === 'critical');
    const anyMissing = [dl, rca, itp].some((s) => s === 'unset');

    if (anyExpired) {
      setVerdict('blocking');
      setSummary('Un document expirat — actualizează înainte de tură.');
    } else if (anyCritical) {
      setVerdict('attention');
      setSummary('Un document expiră în mai puțin de 8 zile.');
    } else if (anyMissing) {
      setVerdict('attention');
      setSummary('Completează datele documentelor pentru verificare completă.');
    } else if (allValid) {
      setVerdict('ok');
      setSummary('Toate documentele sunt valabile.');
    } else {
      setVerdict('attention');
      setSummary('Verifică starea documentelor în Setări.');
    }

    setHydrated(true);
  }, []);

  if (!hydrated || verdict === 'unknown') return null;

  const Icon = verdict === 'ok' ? ShieldCheck : ShieldAlert;
  const tone =
    verdict === 'ok'
      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200 ring-1 ring-inset ring-emerald-500/15'
      : verdict === 'attention'
        ? 'border-amber-500/40 bg-amber-500/10 text-amber-200 ring-1 ring-inset ring-amber-500/15'
        : 'border-rose-500/40 bg-rose-500/10 text-rose-200 ring-1 ring-inset ring-rose-500/15';

  const title =
    verdict === 'ok'
      ? 'Documentele tale sunt valabile'
      : verdict === 'attention'
        ? 'Atenție la documente'
        : 'Document expirat';

  // Match the pill ring color to the verdict so the disc visually
  // belongs to the pill family (emerald / amber / rose).
  const ringTone =
    verdict === 'ok'
      ? 'ring-emerald-500/40'
      : verdict === 'attention'
        ? 'ring-amber-500/40'
        : 'ring-rose-500/40';

  // Tone-matched hover shadow so the lift reads as warm/serious/critical
  // rather than a generic neutral elevation.
  const hoverShadow =
    verdict === 'ok'
      ? 'hover:shadow-md hover:shadow-emerald-500/20'
      : verdict === 'attention'
        ? 'hover:shadow-md hover:shadow-amber-500/20'
        : 'hover:shadow-md hover:shadow-rose-500/20';

  return (
    <a
      href="/dashboard/settings"
      className={`group flex items-center gap-2.5 rounded-2xl border px-3 py-2.5 text-xs font-medium transition-all hover:-translate-y-px active:translate-y-0 focus-visible:outline-2 focus-visible:outline-offset-2 ${tone} ${hoverShadow} ${
        verdict === 'ok'
          ? 'focus-visible:outline-emerald-500'
          : verdict === 'attention'
            ? 'focus-visible:outline-amber-500'
            : 'focus-visible:outline-rose-500'
      }`}
      aria-label={`${title} — ${summary}. Tap pentru detalii.`}
    >
      <span
        aria-hidden
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ring-1 ${ringTone} bg-current/10`}
      >
        <Icon className="h-4 w-4" strokeWidth={2.25} />
      </span>
      <span className="min-w-0 flex-1 truncate">
        <span className="font-semibold">{title}.</span>{' '}
        <span className="text-current/80">{summary}</span>
      </span>
    </a>
  );
}
