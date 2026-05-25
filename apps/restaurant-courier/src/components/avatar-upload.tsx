'use client';

import { useRef, useState } from 'react';
import { Camera, Loader2, X } from 'lucide-react';
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

/**
 * Avatar upload + preview. Uses the courier-avatars bucket (RLS pinned to
 * the courier's own folder by uid). Downscales to ~512px before upload to
 * keep the cell-data footprint small — couriers are often on metered LTE.
 */
export function AvatarUpload({ userId, initialUrl, fullName, saveAvatarUrl }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState<string | null>(initialUrl);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setUploading(true);
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
      await saveAvatarUrl(publicUrl);
      setUrl(publicUrl);
    } catch (err) {
      // Surface the raw error to DevTools so we can diagnose mobile uploads
      // where the user can't easily copy the on-screen message. The friendly
      // mapper hides specifics by design — log keeps them retrievable.
      console.error('[avatar-upload] failed', err);
      setError(friendlyError(err));
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function handleRemove() {
    setError(null);
    setUploading(true);
    try {
      await saveAvatarUrl(null);
      setUrl(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Eroare la ștergere.');
    } finally {
      setUploading(false);
    }
  }

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
        {uploading ? (
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
            disabled={uploading}
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
              disabled={uploading}
              className="gap-1.5 rounded-lg border border-hir-border bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-100 transition hover:-translate-y-px hover:border-hir-border hover:bg-zinc-800 hover:text-white active:translate-y-0 focus-visible:outline-2 focus-visible:outline-zinc-500 focus-visible:outline-offset-2 disabled:opacity-60 disabled:hover:translate-y-0"
            >
              <X className="h-3.5 w-3.5" aria-hidden strokeWidth={2.25} />
              Elimină
            </Button>
          ) : null}
        </div>
        <p className="mt-1.5 text-[11px] leading-relaxed text-hir-muted-fg">
          JPG / PNG / WEBP, max 2 MB. Se afișează în antet.
        </p>
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

// Map opaque storage errors to a message the courier can act on. The
// previous match for "schema invalid|incompatible" was too broad and hid
// the real cause (any error containing both words was relabeled as a
// missing-bucket problem). Match only the exact Supabase phrases now;
// everything else falls through to the raw message so the courier — or
// support — can see what actually went wrong.
function friendlyError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? '');
  const m = raw.toLowerCase();
  if (m.includes('bucket not found') || m.includes('the database schema is invalid')) {
    return 'Stocarea pentru poze nu este configurată pe server. Contactează suportul.';
  }
  if (m.includes('row-level security') || m.includes('rls') || m.includes('unauthorized')) {
    return 'Sesiunea a expirat. Deconectează-te și conectează-te din nou, apoi reîncearcă.';
  }
  if (m.includes('img-load-failed')) {
    return 'Nu am putut citi poza. Încearcă alt format (JPG sau PNG).';
  }
  if (m.includes('exceeded') || m.includes('size') || m.includes('payload too large')) {
    return 'Poza este prea mare. Folosește una mai mică de 2 MB.';
  }
  if (m.includes('mime') || (m.includes('type') && m.includes('not supported'))) {
    return 'Format neacceptat. Folosește JPG, PNG sau WEBP.';
  }
  if (m.includes('network') || m.includes('failed to fetch') || m.includes('load failed')) {
    return 'Conexiune slabă. Verifică internetul și reîncearcă.';
  }
  return raw || 'Eroare la încărcare. Reîncearcă peste câteva secunde.';
}
