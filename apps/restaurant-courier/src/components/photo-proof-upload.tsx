'use client';

import { useRef, useState } from 'react';
import { Camera, X, Check } from 'lucide-react';
import { toast, Button } from '@hir/ui';
import { uploadOrEnqueue, type ProofFolder } from '@/lib/proof-uploader';

type SlotState = { file: File | null; preview: string | null; url: string | null };

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

  function pickFile(ref: React.RefObject<HTMLInputElement>) {
    ref.current?.click();
  }

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement>,
    setter: React.Dispatch<React.SetStateAction<SlotState>>,
  ) {
    const file = e.target.files?.[0];
    if (!file) return;
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
    const result = await uploadOrEnqueue(slot.file, orderId, folder);
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
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-medium text-zinc-300">Fotografie pungă livrare (opțional)</span>
          {delivery.preview ? (
            <Button
              type="button"
              variant="ghost"
              onClick={() => clearSlot(setDelivery, deliveryRef)}
              className="h-auto gap-1 p-0 text-[11px] text-zinc-500 hover:bg-transparent hover:text-zinc-300"
            >
              <X className="h-3 w-3" /> elimină
            </Button>
          ) : null}
        </div>
        {delivery.preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={delivery.preview} alt="Previzualizare dovadă livrare" className="h-32 w-full rounded-lg object-cover" />
        ) : (
          <Button
            type="button"
            variant="ghost"
            onClick={() => pickFile(deliveryRef)}
            className="flex h-20 w-full items-center justify-center gap-2 rounded-lg border border-dashed border-zinc-700 text-xs text-zinc-400 hover:border-violet-500 hover:bg-transparent hover:text-violet-300"
          >
            <Camera className="h-4 w-4" /> Fă o fotografie
          </Button>
        )}
        <input ref={deliveryRef} type="file" accept="image/*" capture="environment" onChange={(e) => { handleChange(e, setDelivery); }} className="hidden" />
        {error ? <p className="mt-2 text-[11px] text-rose-400">{error}</p> : null}
        {queuedFolders.has('delivery') ? (
          <p className="mt-2 text-[11px] text-amber-300">
            Fotografia este salvată local — se va sincroniza automat când ești online.
          </p>
        ) : null}
        {delivery.file ? (
          delivery.url ? (
            // Successful upload — show a confirmation strip instead of the
            // upload button. Gives the dispatcher visual feedback AND gives
            // e2e tests a real upload-complete signal (data-testid below)
            // that the upload-button-stays-rendered approach lacked.
            <p
              data-testid="delivery-proof-uploaded"
              className="mt-2 w-full rounded-lg bg-emerald-900/40 py-2 text-center text-xs font-medium text-emerald-300"
            >
              ✓ Fotografie încărcată
            </p>
          ) : (
            <Button
              type="button"
              disabled={uploading}
              onClick={handleUploadAll}
              className="mt-2 w-full rounded-lg bg-zinc-800 py-2 text-xs font-medium text-zinc-200 hover:bg-zinc-700"
            >
              {uploading ? 'Se încarcă…' : 'Încarcă fotografia'}
            </Button>
          )
        ) : (
          // No photo yet — let parent call onComplete with empty urls for optional skip.
          <Button
            type="button"
            variant="ghost"
            onClick={() => onComplete({})}
            className="mt-2 w-full rounded-lg bg-zinc-800 py-1.5 text-xs text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
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
    <div className="rounded-xl border border-emerald-500/20 bg-zinc-900 p-3">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-emerald-400">
        Documente obligatorii
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
      <Button
        type="button"
        disabled={!allDone || uploading}
        onClick={handleUploadAll}
        className="mt-3 w-full rounded-lg bg-emerald-600 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
      >
        {uploading ? 'Se încarcă…' : 'Trimite documentele'}
      </Button>
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
        <span className="text-[10px] font-medium text-zinc-400">{label}</span>
        {slot.preview ? (
          <span className="text-emerald-400">
            <Check className="h-3 w-3" aria-hidden />
          </span>
        ) : null}
      </div>
      {slot.preview ? (
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={slot.preview} alt={label} className="h-24 w-full rounded-lg object-cover" />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClear}
            aria-label={`Elimină ${label}`}
            className="absolute right-1 top-1 h-6 w-6 rounded-full bg-black/60 text-white hover:bg-black/80"
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          variant="ghost"
          onClick={onPick}
          className="flex h-24 w-full items-center justify-center gap-1 rounded-lg border border-dashed border-zinc-700 text-[10px] text-zinc-500 hover:border-emerald-500/50 hover:bg-transparent hover:text-emerald-400"
        >
          <Camera className="h-4 w-4" />
          Fotografiază
        </Button>
      )}
      <input ref={inputRef} type="file" accept="image/*" capture="environment" onChange={onChange} className="hidden" />
    </div>
  );
}
