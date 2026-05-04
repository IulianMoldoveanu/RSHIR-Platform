'use client';

import { useRef, useState } from 'react';
import { Camera, Loader2, X } from 'lucide-react';
import { getBrowserSupabase } from '@/lib/supabase/browser';

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
      setError(err instanceof Error ? err.message : 'Eroare la încărcare.');
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
      <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-full border-2 border-violet-500/40 bg-zinc-900">
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
            <Loader2 className="h-6 w-6 animate-spin text-violet-300" aria-hidden />
          </div>
        ) : null}
      </div>
      <div className="flex-1">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="inline-flex items-center gap-1.5 rounded-lg bg-violet-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-400 disabled:opacity-50"
          >
            <Camera className="h-3.5 w-3.5" aria-hidden />
            {url ? 'Schimbă' : 'Adaugă'}
          </button>
          {url ? (
            <button
              type="button"
              onClick={handleRemove}
              disabled={uploading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
              Elimină
            </button>
          ) : null}
        </div>
        <p className="mt-1.5 text-[11px] text-zinc-500">
          JPG / PNG / WEBP, max 2 MB. Se afișează în antet.
        </p>
        {error ? <p className="mt-1 text-[11px] text-rose-400">{error}</p> : null}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="user"
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
