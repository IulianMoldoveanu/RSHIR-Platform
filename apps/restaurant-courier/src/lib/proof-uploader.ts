'use client';

import { getBrowserSupabase } from './supabase/browser';
import { enqueueProof, type QueuedProof } from './proof-queue';

const BUCKET = 'courier-proofs';
const UPLOAD_TIMEOUT_MS = 60_000;

export type ProofFolder = QueuedProof['folder'];

export type UploadResult =
  | { ok: true; url: string }
  | { ok: false; queued: true; queueId: number }
  | { ok: false; queued: false; error: Error };

export type ProgressCallback = (pct: number) => void;

function extFromFile(file: File): string {
  const fromName = file.name.split('.').pop()?.toLowerCase();
  if (fromName && /^[a-z0-9]{2,5}$/.test(fromName)) return fromName;
  if (file.type.includes('png')) return 'png';
  if (file.type.includes('webp')) return 'webp';
  return 'jpg';
}

/**
 * Upload via XMLHttpRequest so we get upload-progress events.
 * Falls back to no-progress on environments without XHR (SSR guard).
 * Rejects with a named `TimeoutError` after UPLOAD_TIMEOUT_MS (60s).
 */
function xhrUpload(
  url: string,
  file: File,
  authHeader: string,
  onProgress: ProgressCallback,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      xhr.abort();
      const err = new Error('Încărcare prea lentă, vă rugăm încercați din nou');
      err.name = 'TimeoutError';
      reject(err);
    }, UPLOAD_TIMEOUT_MS);

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    });

    xhr.addEventListener('load', () => {
      clearTimeout(timer);
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100);
        resolve();
      } else {
        reject(new Error(`HTTP ${xhr.status}: ${xhr.responseText || 'eroare la încărcare'}`));
      }
    });

    xhr.addEventListener('error', () => {
      clearTimeout(timer);
      if (!timedOut) reject(new Error('Eroare de rețea la încărcare'));
    });

    xhr.addEventListener('abort', () => {
      clearTimeout(timer);
      // Timeout already rejected above; abort from external caller → network error.
      if (!timedOut) reject(new Error('Încărcarea a fost anulată'));
    });

    xhr.open('POST', url);
    xhr.setRequestHeader('Authorization', authHeader);
    xhr.setRequestHeader('x-upsert', 'false');
    // Content-Type is set automatically by FormData below.
    const fd = new FormData();
    fd.append('', file, file.name || 'photo');
    xhr.send(fd);
  });
}

async function directUpload(
  file: File,
  orderId: string,
  folder: ProofFolder,
  onProgress?: ProgressCallback,
): Promise<string> {
  const supabase = getBrowserSupabase();
  const ext = extFromFile(file);
  const path = `${orderId}/${folder}/${Date.now()}.${ext}`;

  // Try XHR path (progress + timeout) when running in browser.
  if (typeof XMLHttpRequest !== 'undefined' && onProgress) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
    const uploadUrl = `${supabaseUrl}/storage/v1/object/${BUCKET}/${path}`;
    await xhrUpload(uploadUrl, file, `Bearer ${anonKey}`, onProgress);
    return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  }

  // Fallback: Supabase JS client (no progress, but works in all envs).
  // Wrap in AbortController so the promise doesn't stall indefinitely.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);
  try {
    const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type || 'image/jpeg',
    });
    if (error) throw error;
  } finally {
    clearTimeout(timer);
  }
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

// Tries an immediate upload; on network failure (offline / fetch error) writes
// the file to the IndexedDB queue so <ProofSync/> can retry it later. Storage
// errors that are NOT network failures (auth, RLS, bucket) bubble up so the
// caller can show a real error.
export async function uploadOrEnqueue(
  file: File,
  orderId: string,
  folder: ProofFolder,
  onProgress?: ProgressCallback,
): Promise<UploadResult> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    const queueId = await enqueueProof({
      orderId,
      folder,
      blob: file,
      contentType: file.type || 'image/jpeg',
      ext: extFromFile(file),
    });
    return { ok: false, queued: true, queueId };
  }

  try {
    const url = await directUpload(file, orderId, folder, onProgress);
    return { ok: true, url };
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err));
    // Timeout errors should surface to the user, not go to queue.
    if (e.name === 'TimeoutError') {
      return { ok: false, queued: false, error: e };
    }
    if (isNetworkError(e)) {
      try {
        const queueId = await enqueueProof({
          orderId,
          folder,
          blob: file,
          contentType: file.type || 'image/jpeg',
          ext: extFromFile(file),
        });
        return { ok: false, queued: true, queueId };
      } catch (queueErr) {
        return { ok: false, queued: false, error: queueErr instanceof Error ? queueErr : new Error(String(queueErr)) };
      }
    }
    return { ok: false, queued: false, error: e };
  }
}

function isNetworkError(err: Error): boolean {
  const msg = err.message.toLowerCase();
  return (
    msg.includes('network') ||
    msg.includes('fetch') ||
    msg.includes('failed to fetch') ||
    msg.includes('load failed') ||
    msg.includes('offline')
  );
}

export async function uploadQueuedProof(item: QueuedProof): Promise<string> {
  const file = new File([item.blob], `${Date.now()}.${item.ext}`, { type: item.contentType });
  return directUpload(file, item.orderId, item.folder, undefined);
}
