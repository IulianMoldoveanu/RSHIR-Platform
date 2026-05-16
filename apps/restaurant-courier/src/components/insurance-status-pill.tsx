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
      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
      : verdict === 'attention'
        ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
        : 'border-rose-500/30 bg-rose-500/10 text-rose-300';

  const title =
    verdict === 'ok'
      ? 'Documentele tale sunt valabile'
      : verdict === 'attention'
        ? 'Atenție la documente'
        : 'Document expirat';

  return (
    <a
      href="/dashboard/settings"
      className={`flex items-center gap-2 rounded-2xl border px-3 py-2 text-xs font-medium ${tone}`}
      aria-label={`${title} — ${summary}. Tap pentru detalii.`}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1 truncate">
        <span className="font-semibold">{title}.</span>{' '}
        <span className="text-current/80">{summary}</span>
      </span>
    </a>
  );
}
