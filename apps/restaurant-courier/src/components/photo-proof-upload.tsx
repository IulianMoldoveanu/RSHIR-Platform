'use client';

import { useRef, useState } from 'react';
import { Camera, X, Check } from 'lucide-react';
import { toast, Button } from '@hir/ui';
import { uploadOrEnqueue, type ProofFolder } from '@/lib/proof-uploader';

/** Per-slot upload progress, 0-100. Null when not uploading. */
type SlotProgress = Record<ProofFolder, number | null>;

type SlotState = { file: File | null; preview: string | null; url: string | null };

// Maximum allowed file size for proof photos. Raw HEIC shots from recent
// iPhones routinely exceed 5 MB; 10 MB gives comfortable headroom while
// still blocking accidental 50+ MB RAW files that would time out on LTE.
const MAX_PROOF_BYTES = 10 * 1024 * 1024; // 10 MB

function emptySlot(): SlotState {
  return { file: null, preview: null, url: null };
}

type Props = {
  orderId: string;
  vertical: 'restaurant' | 'pharma';
  requiresId: boolean;
  requiresPrescription: boolean;
  /** Called when all required uploads are done; receives upload URLs. */
  onComplete: (urls: { delivery?: string; id?: string; prescription?: string }) => void;
};

/**
 * Photo-proof upload component. Behaviour differs by vertical:
 *
 * - restaurant: single "Fotografie pungă livrare" slot (optional).
 * - pharma with requiresId=true: "ID destinatar" slot (required).
 * - pharma with requiresPrescription=true: "Confirmare medicamente" slot (required).
 *
 * The parent (OrderActions) is notified via onComplete once all required slots
 * have been uploaded. For restaurant, onComplete fires immediately with empty
 * urls and the caller treats the proof as optional.
 */
export function PhotoProofUpload({ orderId, vertical, requiresId, requiresPrescription, onComplete }: Props) {
  const deliveryRef = useRef<HTMLInputElement>(null);
  const idRef = useRef<HTMLInputElement>(null);
  const rxRef = useRef<HTMLInputElement>(null);

  const [delivery, setDelivery] = useState<SlotState>(emptySlot());
  const [idSlot, setIdSlot] = useState<SlotState>(emptySlot());
  const [rxSlot, setRxSlot] = useState<SlotState>(emptySlot());
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [queuedFolders, setQueuedFolders] = useState<Set<ProofFolder>>(new Set());
  const [slotProgress, setSlotProgress] = useState<SlotProgress>({
    delivery: null,
    id: null,
    prescription: null,
  });

  function pickFile(ref: React.RefObject<HTMLInputElement>) {
    ref.current?.click();
  }

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement>,
    setter: React.Dispatch<React.SetStateAction<SlotState>>,
  ) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_PROOF_BYTES) {
      setError(`Fișierul este prea mare (max 10 MB). Încearcă o fotografie mai mică.`);
      // Reset the input so the courier can pick a different file.
      e.target.value = '';
      return;
    }
    setter((prev) => {
      if (prev.preview) URL.revokeObjectURL(prev.preview);
      return { file, preview: URL.createObjectURL(file), url: null };
    });
    setError(null);
  }

  function clearSlot(setter: React.Dispatch<React.SetStateAction<SlotState>>, ref: React.RefObject<HTMLInputElement>) {
    setter((prev) => {
      if (prev.preview) URL.revokeObjectURL(prev.preview);
      return emptySlot();
    });
    if (ref.current) ref.current.value = '';
  }

  async function uploadSlot(slot: SlotState, folder: ProofFolder): Promise<string | undefined> {
    if (!slot.file) return undefined;
    setSlotProgress((prev) => ({ ...prev, [folder]: 0 }));
    const result = await uploadOrEnqueue(slot.file, orderId, folder, (pct) => {
      setSlotProgress((prev) => ({ ...prev, [folder]: pct }));
    });
    setSlotProgress((prev) => ({ ...prev, [folder]: null }));
    if (result.ok) return result.url;
    if (result.queued) {
      setQueuedFolders((prev) => {
        const next = new Set(prev);
        next.add(folder);
        return next;
      });
      // Notify ProofSync to re-poll the queue immediately.
      window.dispatchEvent(new Event('hir:proof-enqueued'));
      return undefined;
    }
    throw result.error;
  }

  async function handleUploadAll() {
    setUploading(true);
    setError(null);
    // Audit BUG P1 #7 fix: previously a partial-failure (id ok, rx throws)
    // would push the user to retry, which re-uploaded id to a fresh path
    // and lost the first url. Now we skip slots that already have a URL
    // and only retry the failures. Same SlotState.url field carries the
    // success URL forward so retries are idempotent.
    try {
      const tasks: Array<Promise<{ folder: 'delivery' | 'id' | 'prescription'; url?: string }>> = [];
      const cached = {
        delivery: delivery.url ?? undefined,
        id: idSlot.url ?? undefined,
        prescription: rxSlot.url ?? undefined,
      };
      if (delivery.file && !cached.delivery) {
        tasks.push(uploadSlot(delivery, 'delivery').then((url) => ({ folder: 'delivery', url })));
      }
      if (idSlot.file && !cached.id) {
        tasks.push(uploadSlot(idSlot, 'id').then((url) => ({ folder: 'id', url })));
      }
      if (rxSlot.file && !cached.prescription) {
        tasks.push(uploadSlot(rxSlot, 'prescription').then((url) => ({ folder: 'prescription', url })));
      }

      // Show retry feedback only when the user is re-attempting after a
      // previous failure (error was set). The total count is how many slots
      // still need uploading vs. the grand total that were attempted.
      if (error !== null && tasks.length > 0) {
        const totalSlots =
          (delivery.file ? 1 : 0) + (idSlot.file ? 1 : 0) + (rxSlot.file ? 1 : 0);
        const doneCount = totalSlots - tasks.length;
        toast.loading(`Reîncerc poza ${doneCount + 1} / ${totalSlots}`, { id: 'proof-retry' });
      }
      const results = await Promise.allSettled(tasks);
      const next = { ...cached };
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value.url) {
          next[r.value.folder] = r.value.url;
        }
      }
      // Persist successes back to slot state so a retry skips them.
      if (next.delivery && !cached.delivery)
        setDelivery((prev) => ({ ...prev, url: next.delivery! }));
      if (next.id && !cached.id) setIdSlot((prev) => ({ ...prev, url: next.id! }));
      if (next.prescription && !cached.prescription)
        setRxSlot((prev) => ({ ...prev, url: next.prescription! }));

      // Surface any remaining failures for retry.
      const failed = results.filter((r) => r.status === 'rejected');
      if (failed.length > 0) {
        const first = failed[0] as PromiseRejectedResult;
        const reason = first.reason;
        setError(reason instanceof Error ? reason.message : 'Eroare la încărcare. Încearcă din nou.');
        return;
      }
      // Guard against the offline-queue case: uploadSlot returns undefined
      // (not throws) when a file is enqueued for later sync. For pharma required
      // slots this means the proof URL is not yet available — calling onComplete
      // with undefined URLs would silently bypass the mandatory pharma proof
      // requirement. Block and show an error so the courier must reconnect first.
      if (requiresId && !next.id) {
        setError('Actul de identitate nu a putut fi încărcat. Conectează-te la internet și încearcă din nou.');
        return;
      }
      if (requiresPrescription && !next.prescription) {
        setError('Prescripția nu a putut fi încărcată. Conectează-te la internet și încearcă din nou.');
        return;
      }
      onComplete({ delivery: next.delivery, id: next.id, prescription: next.prescription });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Eroare la încărcare. Încearcă din nou.');
    } finally {
      toast.dismiss('proof-retry');
      setUploading(false);
    }
  }

  if (vertical === 'restaurant') {
    // Single optional slot — auto-submit on pick.
    return (
      <div className="rounded-xl border border-hir-border bg-hir-surface p-3 ring-1 ring-inset ring-hir-border/40">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-hir-muted-fg">
            Fotografie pungă livrare (opțional)
          </span>
          {delivery.preview ? (
            <Button
              type="button"
              variant="ghost"
              onClick={() => clearSlot(setDelivery, deliveryRef)}
              className="h-auto gap-1 p-0 text-[11px] text-hir-muted-fg transition-colors hover:bg-transparent hover:text-rose-300 focus-visible:outline-2 focus-visible:outline-rose-500 focus-visible:outline-offset-2"
            >
              <X className="h-3 w-3" strokeWidth={2.5} /> elimină
            </Button>
          ) : null}
        </div>
        {delivery.preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={delivery.preview}
            alt="Previzualizare dovadă livrare"
            className="h-32 w-full rounded-lg object-cover ring-1 ring-violet-500/30"
          />
        ) : (
          <Button
            type="button"
            variant="ghost"
            onClick={() => pickFile(deliveryRef)}
            className="flex h-24 w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-hir-border text-xs font-medium text-hir-muted-fg transition-all hover:-translate-y-px hover:border-violet-500/60 hover:bg-violet-500/5 hover:text-violet-200 active:translate-y-0 focus-visible:outline-2 focus-visible:outline-violet-500 focus-visible:outline-offset-2"
          >
            <Camera className="h-5 w-5" strokeWidth={2.25} /> Fă o fotografie
          </Button>
        )}
        <input ref={deliveryRef} type="file" accept="image/*" capture="environment" onChange={(e) => { handleChange(e, setDelivery); }} className="hidden" />
        {error ? <p className="mt-2 text-[11px] text-rose-400">{error}</p> : null}
        {queuedFolders.has('delivery') ? (
          <p className="mt-2 text-[11px] text-amber-300">
            Fotografia este salvată local — se va sincroniza automat când ești online.
          </p>
        ) : null}
        {slotProgress.delivery !== null ? (
          <UploadProgressBar pct={slotProgress.delivery} />
        ) : null}
        {delivery.file ? (
          delivery.url ? (
            // Successful upload — show a confirmation strip instead of the
            // upload button. Gives the dispatcher visual feedback AND gives
            // e2e tests a real upload-complete signal (data-testid below)
            // that the upload-button-stays-rendered approach lacked.
            <p
              data-testid="delivery-proof-uploaded"
              className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 py-2.5 text-center text-xs font-semibold text-emerald-100 ring-1 ring-inset ring-emerald-500/20"
            >
              <Check className="h-3.5 w-3.5" aria-hidden strokeWidth={3} />
              Fotografie încărcată
            </p>
          ) : (
            <Button
              type="button"
              disabled={uploading}
              onClick={handleUploadAll}
              className="mt-2 w-full rounded-lg bg-violet-600 py-2.5 text-xs font-semibold text-white shadow-md shadow-violet-600/30 transition-all hover:-translate-y-px hover:bg-violet-500 hover:shadow-lg hover:shadow-violet-600/40 active:translate-y-0 focus-visible:outline-2 focus-visible:outline-violet-400 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none disabled:hover:translate-y-0"
            >
              {uploading ? 'Se încarcă…' : error ? 'Încearcă din nou' : 'Încarcă fotografia'}
            </Button>
          )
        ) : (
          // No photo yet — let parent call onComplete with empty urls for optional skip.
          <Button
            type="button"
            variant="ghost"
            onClick={() => onComplete({})}
            className="mt-2 w-full rounded-lg border border-hir-border bg-hir-surface py-2 text-xs font-medium text-hir-muted-fg transition-colors hover:border-hir-muted-fg/40 hover:bg-hir-border/40 hover:text-hir-fg focus-visible:outline-2 focus-visible:outline-violet-500 focus-visible:outline-offset-2"
          >
            Continuă fără fotografie
          </Button>
        )}
      </div>
    );
  }

  // Pharma: show required slots side-by-side.
  const allDone =
    (!requiresId || !!idSlot.file) &&
    (!requiresPrescription || !!rxSlot.file);

  return (
    <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/5 p-4 ring-1 ring-inset ring-emerald-500/10">
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-emerald-300">
        Documente obligatorii · farmacie
      </p>
      <div className="grid grid-cols-2 gap-3">
        {requiresId ? (
          <PhotoSlot
            label="ID destinatar"
            slot={idSlot}
            inputRef={idRef}
            onPick={() => pickFile(idRef)}
            onChange={(e) => handleChange(e, setIdSlot)}
            onClear={() => clearSlot(setIdSlot, idRef)}
          />
        ) : null}
        {requiresPrescription ? (
          <PhotoSlot
            label="Confirmare medicamente"
            slot={rxSlot}
            inputRef={rxRef}
            onPick={() => pickFile(rxRef)}
            onChange={(e) => handleChange(e, setRxSlot)}
            onClear={() => clearSlot(setRxSlot, rxRef)}
          />
        ) : null}
      </div>
      {error ? <p className="mt-2 text-[11px] text-rose-400">{error}</p> : null}
      {(slotProgress.id !== null || slotProgress.prescription !== null) ? (
        <UploadProgressBar
          pct={Math.round(
            ((slotProgress.id ?? 100) + (slotProgress.prescription ?? 100)) /
              (requiresId && requiresPrescription ? 2 : 1),
          )}
        />
      ) : null}
      <Button
        type="button"
        disabled={!allDone || uploading}
        onClick={handleUploadAll}
        className="mt-3 flex min-h-[48px] w-full items-center justify-center rounded-lg bg-emerald-600 py-2 text-sm font-semibold text-white shadow-md shadow-emerald-600/30 transition-all hover:-translate-y-px hover:bg-emerald-500 hover:shadow-lg hover:shadow-emerald-600/40 active:translate-y-0 focus-visible:outline-2 focus-visible:outline-emerald-400 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none disabled:hover:translate-y-0"
      >
        {uploading ? 'Se încarcă…' : error ? 'Încearcă din nou' : 'Trimite documentele'}
      </Button>
    </div>
  );
}

function UploadProgressBar({ pct }: { pct: number }) {
  return (
    <div
      className="mt-2 overflow-hidden rounded-full bg-hir-border ring-1 ring-inset ring-hir-border/60"
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="Progres încărcare"
    >
      <div
        className="h-1.5 rounded-full bg-gradient-to-r from-violet-500 to-violet-400 shadow-[0_0_6px_rgba(124,58,237,0.55)] transition-all duration-200"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function PhotoSlot({
  label,
  slot,
  inputRef,
  onPick,
  onChange,
  onClear,
}: {
  label: string;
  slot: SlotState;
  inputRef: React.RefObject<HTMLInputElement>;
  onPick: () => void;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClear: () => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-hir-muted-fg">
          {label}
        </span>
        {slot.preview ? (
          <span
            aria-hidden
            className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500/20 ring-1 ring-emerald-500/40"
          >
            <Check className="h-2.5 w-2.5 text-emerald-300" strokeWidth={3} />
          </span>
        ) : null}
      </div>
      {slot.preview ? (
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={slot.preview}
            alt={label}
            className="h-24 w-full rounded-lg object-cover ring-1 ring-emerald-500/30"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClear}
            aria-label={`Elimină ${label}`}
            className="absolute right-1 top-1 h-6 w-6 rounded-full bg-black/70 text-white shadow-sm backdrop-blur transition-colors hover:bg-black/90 focus-visible:outline-2 focus-visible:outline-rose-500 focus-visible:outline-offset-1"
          >
            <X className="h-3 w-3" strokeWidth={2.5} />
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          variant="ghost"
          onClick={onPick}
          className="flex h-24 w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-hir-border text-[11px] font-medium text-hir-muted-fg transition-all hover:-translate-y-px hover:border-emerald-500/60 hover:bg-emerald-500/5 hover:text-emerald-300 active:translate-y-0 focus-visible:outline-2 focus-visible:outline-emerald-500 focus-visible:outline-offset-2"
        >
          <Camera className="h-4 w-4" strokeWidth={2.25} />
          Fotografiază
        </Button>
      )}
      <input ref={inputRef} type="file" accept="image/*" capture="environment" onChange={onChange} className="hidden" />
    </div>
  );
}
