'use client';

import { useEffect, useRef, useState } from 'react';
import { Camera, Check, Loader2, X } from 'lucide-react';
import { getBrowserSupabase } from '@/lib/supabase/browser';
import { Button } from '@hir/ui';

const MAX_DIM = 512; // px on the longer edge after downscale
const TARGET_QUALITY = 0.82; // jpeg quality after downscale

type Props = {
  userId: string;
  initialUrl: string | null;
  fullName: string | null;
  /**
   * Server action that persists the new public URL onto courier_profiles.
   * Called after the file lands in storage. Receives `null` to clear.
   */
  saveAvatarUrl: (url: string | null) => Promise<void>;
};

type Status = 'idle' | 'saving' | 'saved' | 'error';

/**
 * Avatar upload + preview. Uses the courier-avatars bucket (RLS pinned to
 * the courier's own folder by uid). Downscales to ~512px before upload to
 * keep the cell-data footprint small — couriers are often on metered LTE.
 *
 * UX (2026-06-04): there is no manual "Save" button — picking a photo saves
 * it. Couriers reported the photo "vanishing" because the silent auto-save
 * gave no feedback on weak LTE, so they navigated away before it finished.
 * Now we (1) show the picked photo INSTANTLY via an object URL while it
 * uploads, and (2) surface an explicit "Se salvează…" → "✓ Salvat" state so
 * the courier knows it persisted. On error we revert to the last saved photo.
 */
export function AvatarUpload({ userId, initialUrl, fullName, saveAvatarUrl }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  // The currently displayed image (optimistic object URL or persisted URL).
  const [url, setUrl] = useState<string | null>(initialUrl);
  // The last server-confirmed URL, used to revert the preview on error.
  const savedUrlRef = useRef<string | null>(initialUrl);
  // The live optimistic object URL, revoked when replaced or on unmount.
  const objectUrlRef = useRef<string | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);

  // Revoke any outstanding object URL when the component unmounts.
  useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, []);

  function setOptimisticPreview(objectUrl: string) {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = objectUrl;
    setUrl(objectUrl);
  }

  function clearOptimisticPreview() {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  }

  async function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setStatus('saving');
    try {
      // iPhone gallery returns HEIC by default. Most browsers can't decode it
      // on a canvas, so reject early with a clear message instead of bubbling
      // up a cryptic storage error after the canvas step silently fails.
      const lower = (file.name || '').toLowerCase();
      if (
        file.type === 'image/heic' ||
        file.type === 'image/heif' ||
        lower.endsWith('.heic') ||
        lower.endsWith('.heif')
      ) {
        throw new Error(
          'Format HEIC neacceptat. Schimbă din Setări iPhone → Cameră → Formate → „Cel mai compatibil" sau alege o poză JPG/PNG.',
        );
      }
      const blob = await downscale(file);
      // Show the picked photo immediately so the courier sees it the moment
      // they choose it — the upload + save then run "behind" this preview.
      setOptimisticPreview(URL.createObjectURL(blob));
      const ext = blob.type === 'image/png' ? 'png' : 'jpg';
      // Cache-bust on every upload so the new image replaces the cached one.
      const path = `${userId}/avatar-${Date.now()}.${ext}`;
      const supa = getBrowserSupabase();
      const { error: upErr } = await supa.storage
        .from('courier-avatars')
        .upload(path, blob, {
          contentType: blob.type,
          cacheControl: '3600',
          upsert: false,
        });
      if (upErr) throw upErr;
      const { data: pub } = supa.storage
        .from('courier-avatars')
        .getPublicUrl(path);
      const publicUrl = pub.publicUrl;
      // Persists the URL onto courier_profiles. Resolves only on a confirmed
      // DB write (the action throws otherwise), so reaching the next line
      // means the photo is truly saved.
      await saveAvatarUrl(publicUrl);
      // Swap the optimistic object URL for the persisted public URL.
      savedUrlRef.current = publicUrl;
      setUrl(publicUrl);
      clearOptimisticPreview();
      setStatus('saved');
    } catch (err) {
      // Revert to the last confirmed photo so the preview never lies.
      clearOptimisticPreview();
      setUrl(savedUrlRef.current);
      setError(friendlyError(err));
      setStatus('error');
    } finally {
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function handleRemove() {
    setError(null);
    setStatus('saving');
    try {
      await saveAvatarUrl(null);
      clearOptimisticPreview();
      savedUrlRef.current = null;
      setUrl(null);
      setStatus('idle');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Eroare la ștergere.');
      setStatus('error');
    }
  }

  const busy = status === 'saving';

  const initials = fullName
    ? fullName
        .split(' ')
        .map((part) => part[0])
        .filter(Boolean)
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : '?';

  return (
    <div className="flex items-center gap-4">
      <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-full border-2 border-violet-500/40 bg-zinc-900 shadow-md shadow-violet-500/15 ring-1 ring-inset ring-violet-500/20">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt="Poza ta de profil"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-2xl font-bold text-violet-300">
            {initials}
          </div>
        )}
        {busy ? (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <Loader2 className="h-6 w-6 animate-spin text-violet-300" aria-hidden strokeWidth={2.25} />
          </div>
        ) : null}
      </div>
      <div className="flex-1">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="gap-1.5 rounded-lg bg-violet-500 px-3 py-1.5 text-xs font-semibold text-white shadow-md shadow-violet-500/30 transition hover:-translate-y-px hover:bg-violet-400 hover:shadow-lg hover:shadow-violet-500/40 active:translate-y-0 focus-visible:outline-2 focus-visible:outline-violet-500 focus-visible:outline-offset-2 disabled:opacity-60 disabled:shadow-none disabled:hover:translate-y-0"
          >
            <Camera className="h-3.5 w-3.5" aria-hidden strokeWidth={2.25} />
            {url ? 'Schimbă' : 'Adaugă'}
          </Button>
          {url ? (
            <Button
              type="button"
              variant="outline"
              onClick={handleRemove}
              disabled={busy}
              className="gap-1.5 rounded-lg border border-hir-border bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-100 transition hover:-translate-y-px hover:border-hir-border hover:bg-zinc-800 hover:text-white active:translate-y-0 focus-visible:outline-2 focus-visible:outline-zinc-500 focus-visible:outline-offset-2 disabled:opacity-60 disabled:hover:translate-y-0"
            >
              <X className="h-3.5 w-3.5" aria-hidden strokeWidth={2.25} />
              Elimină
            </Button>
          ) : null}
        </div>
        {/* Explicit save state — the courier no longer has to guess whether
            the photo persisted. */}
        {status === 'saving' ? (
          <p className="mt-1.5 flex items-center gap-1.5 text-[11px] font-medium text-violet-300">
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden strokeWidth={2.5} />
            Se salvează…
          </p>
        ) : status === 'saved' ? (
          <p className="mt-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-emerald-300">
            <Check className="h-3 w-3" aria-hidden strokeWidth={3} />
            Poză salvată
          </p>
        ) : (
          <p className="mt-1.5 text-[11px] leading-relaxed text-hir-muted-fg">
            JPG / PNG / WEBP, max 2 MB. Se salvează automat și apare în antet.
          </p>
        )}
        {error ? <p className="mt-1 text-[11px] font-medium text-rose-400">{error}</p> : null}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handlePick}
        className="hidden"
      />
    </div>
  );
}

// Downscale on a canvas before upload. Saves bandwidth on metered LTE and
// ensures the storage bucket size limit (2 MB) isn't blown by raw 4032px iPhone
// shots. Returns the original file untouched if the browser doesn't support
// canvas (vanishingly rare; stays a safe fallback).
async function downscale(file: File): Promise<Blob> {
  if (typeof document === 'undefined') return file;
  const dataUrl = await readAsDataUrl(file);
  const img = await loadImage(dataUrl);
  const longer = Math.max(img.width, img.height);
  const scale = longer > MAX_DIM ? MAX_DIM / longer : 1;
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return file;
  ctx.drawImage(img, 0, 0, w, h);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', TARGET_QUALITY),
  );
  if (!blob) return file;
  return blob;
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('img-load-failed'));
    img.src = src;
  });
}

// Map opaque storage errors to a message the courier can act on. Supabase
// returns "the database schema is invalid or incompatible" when the
// `courier-avatars` bucket is missing in the target project — almost
// always a deployment issue rather than a real client mistake. Surface
// that explicitly so the courier doesn't blame their phone.
function friendlyError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? '');
  const m = raw.toLowerCase();
  if (m.includes('schema') && (m.includes('invalid') || m.includes('incompatible'))) {
    return 'Stocarea pentru poze nu este configurată pe server. Contactează suportul.';
  }
  if (m.includes('img-load-failed')) {
    return 'Nu am putut citi poza. Încearcă alt format (JPG sau PNG).';
  }
  if (m.includes('exceeded') || m.includes('size')) {
    return 'Poza este prea mare. Folosește una mai mică de 2 MB.';
  }
  if (m.includes('mime') || m.includes('type')) {
    return 'Format neacceptat. Folosește JPG, PNG sau WEBP.';
  }
  return raw || 'Eroare la încărcare.';
}
