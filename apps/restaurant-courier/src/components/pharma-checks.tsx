'use client';

import { useState } from 'react';
import { Check, ShieldCheck } from 'lucide-react';
import { PhotoProofUpload } from './photo-proof-upload';
import { Button } from '@hir/ui';

export type PharmaMetadata = {
  requires_id_verification?: boolean;
  requires_prescription?: boolean;
};

type UploadUrls = { delivery?: string; id?: string; prescription?: string };

type Props = {
  orderId: string;
  pharmaMetadata: PharmaMetadata;
  /** Called once all required checks + uploads are satisfied. */
  onAllSatisfied: (uploadUrls: UploadUrls) => void;
};

/**
 * "Verificări obligatorii" section shown above the delivery swipe button
 * when vertical === 'pharma'. Blocks delivery until required checks pass.
 *
 * Two checkboxes + photo uploads — each check turns emerald when satisfied.
 */
export function PharmaChecks({ orderId, pharmaMetadata, onAllSatisfied }: Props) {
  const requiresId = pharmaMetadata.requires_id_verification ?? false;
  const requiresRx = pharmaMetadata.requires_prescription ?? false;

  const [idChecked, setIdChecked] = useState(false);
  const [rxChecked, setRxChecked] = useState(false);
  const [uploadsDone, setUploadsDone] = useState(false);
  const [uploadUrls, setUploadUrls] = useState<UploadUrls>({});

  // All text-checkbox requirements must be checked before uploads are shown.
  const checksOk = (!requiresId || idChecked) && (!requiresRx || rxChecked);

  function handleUploadsComplete(urls: UploadUrls) {
    setUploadUrls(urls);
    setUploadsDone(true);
    onAllSatisfied(urls);
  }

  return (
    <section className="rounded-2xl border border-emerald-500/30 bg-hir-surface p-4 shadow-md shadow-emerald-500/5 ring-1 ring-inset ring-emerald-500/10">
      <div className="mb-3 flex items-start gap-3">
        <span
          aria-hidden
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 ring-1 ring-emerald-500/30"
        >
          <ShieldCheck className="h-4 w-4 text-emerald-300" strokeWidth={2.25} />
        </span>
        <div className="flex flex-col gap-0.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-300">
            Verificări obligatorii
          </p>
          <p className="text-xs leading-relaxed text-hir-muted-fg">
            Bifează fiecare pas, apoi încarcă fotografiile. Fără ele nu putem
            confirma livrarea.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {requiresId ? (
          <CheckRow
            label="Am verificat actul de identitate al destinatarului"
            checked={idChecked}
            onToggle={() => setIdChecked((v) => !v)}
          />
        ) : null}
        {requiresRx ? (
          <CheckRow
            label="Am încărcat prescripția"
            checked={rxChecked}
            onToggle={() => setRxChecked((v) => !v)}
          />
        ) : null}
      </div>

      {checksOk && !uploadsDone ? (
        <div className="mt-4">
          <PhotoProofUpload
            orderId={orderId}
            vertical="pharma"
            requiresId={requiresId}
            requiresPrescription={requiresRx}
            onComplete={handleUploadsComplete}
          />
        </div>
      ) : null}

      {uploadsDone ? (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 ring-1 ring-inset ring-emerald-500/20">
          <Check className="h-4 w-4 text-emerald-300" aria-hidden strokeWidth={2.5} />
          <span className="text-xs font-medium text-emerald-200">Toate verificările completate</span>
        </div>
      ) : null}
    </section>
  );
}

function CheckRow({
  label,
  checked,
  onToggle,
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      onClick={onToggle}
      aria-pressed={checked}
      className={`flex h-auto w-full items-start gap-3 rounded-lg border p-3 text-left transition-all hover:-translate-y-px focus-visible:outline-2 focus-visible:outline-emerald-500 focus-visible:outline-offset-2 active:translate-y-0 ${
        checked
          ? 'border-emerald-500/40 bg-emerald-500/10 ring-1 ring-inset ring-emerald-500/20 hover:border-emerald-500/60'
          : 'border-hir-border bg-zinc-950 hover:border-emerald-500/40 hover:bg-zinc-950'
      }`}
    >
      <span
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
          checked
            ? 'border-emerald-500 bg-emerald-500 text-white shadow-sm shadow-emerald-500/40'
            : 'border-hir-border bg-hir-surface'
        }`}
      >
        {checked ? <Check className="h-3 w-3" aria-hidden strokeWidth={3} /> : null}
      </span>
      <span className={`text-sm leading-snug ${checked ? 'font-medium text-emerald-200' : 'text-zinc-300'}`}>
        {label}
      </span>
    </Button>
  );
}
