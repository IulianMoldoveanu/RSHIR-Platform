'use client';

import { useRef, useState } from 'react';
import { Camera, X, Check } from 'lucide-react';
import { getBrowserSupabase } from '@/lib/supabase/browser';

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

  async function uploadSlot(slot: SlotState, folder: string): Promise<string | undefined> {
    if (!slot.file) return undefined;
    const supabase = getBrowserSupabase();
    const ext = slot.file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const path = `${orderId}/${folder}/${Date.now()}.${ext}`;
    const { error: uploadErr } = await supabase.storage
      .from('courier-proofs')
      .upload(path, slot.file, { cacheControl: '3600', upsert: false, contentType: slot.file.type || 'image/jpeg' });
    if (uploadErr) throw uploadErr;
    const { data } = supabase.storage.from('courier-proofs').getPublicUrl(path);
    return data.publicUrl;
  }

  async function handleUploadAll() {
    setUploading(true);
    setError(null);
    try {
      const [deliveryUrl, idUrl, rxUrl] = await Promise.all([
        uploadSlot(delivery, 'delivery'),
        uploadSlot(idSlot, 'id'),
        uploadSlot(rxSlot, 'prescription'),
      ]);
      onComplete({ delivery: deliveryUrl, id: idUrl, prescription: rxUrl });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Eroare la încărcare. Încearcă din nou.');
    } finally {
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
            <button
              type="button"
              onClick={() => clearSlot(setDelivery, deliveryRef)}
              className="inline-flex items-center gap-1 text-[11px] text-zinc-500 hover:text-zinc-300"
            >
              <X className="h-3 w-3" /> elimină
            </button>
          ) : null}
        </div>
        {delivery.preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={delivery.preview} alt="Previzualizare dovadă livrare" className="h-32 w-full rounded-lg object-cover" />
        ) : (
          <button
            type="button"
            onClick={() => pickFile(deliveryRef)}
            className="flex h-20 w-full items-center justify-center gap-2 rounded-lg border border-dashed border-zinc-700 text-xs text-zinc-400 hover:border-violet-500 hover:text-violet-300"
          >
            <Camera className="h-4 w-4" /> Fă o fotografie
          </button>
        )}
        <input ref={deliveryRef} type="file" accept="image/*" capture="environment" onChange={(e) => { handleChange(e, setDelivery); }} className="hidden" />
        {error ? <p className="mt-2 text-[11px] text-rose-400">{error}</p> : null}
        {delivery.file ? (
          <button
            type="button"
            disabled={uploading}
            onClick={handleUploadAll}
            className="mt-2 w-full rounded-lg bg-zinc-800 py-2 text-xs font-medium text-zinc-200 hover:bg-zinc-700 disabled:opacity-50"
          >
            {uploading ? 'Se încarcă…' : 'Încarcă fotografia'}
          </button>
        ) : (
          // No photo yet — let parent call onComplete with empty urls for optional skip.
          <button
            type="button"
            onClick={() => onComplete({})}
            className="mt-2 w-full rounded-lg bg-zinc-800 py-1.5 text-xs text-zinc-500 hover:text-zinc-300"
          >
            Continuă fără fotografie
          </button>
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
      <button
        type="button"
        disabled={!allDone || uploading}
        onClick={handleUploadAll}
        className="mt-3 w-full rounded-lg bg-emerald-600 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {uploading ? 'Se încarcă…' : 'Trimite documentele'}
      </button>
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
          <button
            type="button"
            onClick={onClear}
            aria-label={`Elimină ${label}`}
            className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={onPick}
          className="flex h-24 w-full items-center justify-center gap-1 rounded-lg border border-dashed border-zinc-700 text-[10px] text-zinc-500 hover:border-emerald-500/50 hover:text-emerald-400"
        >
          <Camera className="h-4 w-4" />
          Fotografiază
        </button>
      )}
      <input ref={inputRef} type="file" accept="image/*" capture="environment" onChange={onChange} className="hidden" />
    </div>
  );
}
