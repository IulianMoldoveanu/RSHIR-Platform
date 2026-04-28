'use client';

import { useRef, useState } from 'react';
import { Camera, X } from 'lucide-react';
import { SwipeButton } from '@/components/swipe-button';
import { getBrowserSupabase } from '@/lib/supabase/browser';

/**
 * Client-side action panel for the order detail page. Renders the right
 * swipe-to-confirm based on the order's current status, and handles the
 * photo-proof capture flow before marking delivered.
 *
 * Server actions are passed in as props (already bound to the order id) so
 * this component stays thin and the parent keeps server-action ownership.
 */
type Props = {
  orderId: string;
  status: string;
  isMine: boolean;
  isAvailable: boolean;
  acceptAction: () => Promise<void>;
  pickedUpAction: () => Promise<void>;
  /** Server action that accepts an optional proof URL. */
  deliveredAction: (proofUrl?: string) => Promise<void>;
};

export function OrderActions({
  orderId,
  status,
  isMine,
  isAvailable,
  acceptAction,
  pickedUpAction,
  deliveredAction,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [proofPreview, setProofPreview] = useState<string | null>(null);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  function handlePickPhoto() {
    fileInputRef.current?.click();
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setProofFile(file);
    setProofPreview(URL.createObjectURL(file));
    setUploadError(null);
  }

  function clearPhoto() {
    setProofFile(null);
    if (proofPreview) URL.revokeObjectURL(proofPreview);
    setProofPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function uploadProofAndMarkDelivered() {
    let publicUrl: string | undefined;
    if (proofFile) {
      try {
        const supabase = getBrowserSupabase();
        const ext = proofFile.name.split('.').pop()?.toLowerCase() || 'jpg';
        const path = `${orderId}/${Date.now()}.${ext}`;
        const { error } = await supabase.storage
          .from('courier-proofs')
          .upload(path, proofFile, {
            cacheControl: '3600',
            upsert: false,
            contentType: proofFile.type || 'image/jpeg',
          });
        if (error) throw error;
        const { data } = supabase.storage.from('courier-proofs').getPublicUrl(path);
        publicUrl = data.publicUrl;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Eroare la încărcarea fotografiei';
        setUploadError(msg);
        // Don't proceed — let the courier retry or skip the photo by clearing.
        throw err;
      }
    }
    await deliveredAction(publicUrl);
  }

  return (
    <div className="flex flex-col gap-3">
      {isAvailable ? (
        <SwipeButton label="→ Glisează pentru a accepta" onConfirm={acceptAction} />
      ) : null}

      {isMine && status === 'ACCEPTED' ? (
        <SwipeButton
          label="→ Glisează pentru a confirma ridicare"
          onConfirm={pickedUpAction}
        />
      ) : null}

      {isMine && (status === 'PICKED_UP' || status === 'IN_TRANSIT') ? (
        <>
          {/* Photo capture step — optional but encouraged. */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium text-zinc-300">
                Dovadă livrare (opțional)
              </span>
              {proofPreview ? (
                <button
                  type="button"
                  onClick={clearPhoto}
                  className="inline-flex items-center gap-1 text-[11px] text-zinc-500 hover:text-zinc-300"
                >
                  <X className="h-3 w-3" /> elimină
                </button>
              ) : null}
            </div>
            {proofPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={proofPreview}
                alt="Previzualizare dovadă livrare"
                className="h-32 w-full rounded-lg object-cover"
              />
            ) : (
              <button
                type="button"
                onClick={handlePickPhoto}
                className="flex h-20 w-full items-center justify-center gap-2 rounded-lg border border-dashed border-zinc-700 text-xs text-zinc-400 hover:border-violet-500 hover:text-violet-300"
              >
                <Camera className="h-4 w-4" />
                Fă o fotografie
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFileChange}
              className="hidden"
            />
            {uploadError ? (
              <p className="mt-2 text-[11px] text-rose-400">{uploadError}</p>
            ) : null}
          </div>

          <SwipeButton
            label="→ Glisează pentru a confirma livrare"
            onConfirm={uploadProofAndMarkDelivered}
            variant="success"
          />
        </>
      ) : null}
    </div>
  );
}
