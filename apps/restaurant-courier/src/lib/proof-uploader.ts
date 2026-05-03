'use client';

import { getBrowserSupabase } from './supabase/browser';
import { enqueueProof, type QueuedProof } from './proof-queue';

const BUCKET = 'courier-proofs';

export type ProofFolder = QueuedProof['folder'];

export type UploadResult =
  | { ok: true; url: string }
  | { ok: false; queued: true; queueId: number }
  | { ok: false; queued: false; error: Error };

function extFromFile(file: File): string {
  const fromName = file.name.split('.').pop()?.toLowerCase();
  if (fromName && /^[a-z0-9]{2,5}$/.test(fromName)) return fromName;
  if (file.type.includes('png')) return 'png';
  if (file.type.includes('webp')) return 'webp';
  return 'jpg';
}

async function directUpload(file: File, orderId: string, folder: ProofFolder): Promise<string> {
  const supabase = getBrowserSupabase();
  const ext = extFromFile(file);
  const path = `${orderId}/${folder}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type || 'image/jpeg',
  });
  if (error) throw error;
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
    const url = await directUpload(file, orderId, folder);
    return { ok: true, url };
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err));
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
  return directUpload(file, item.orderId, item.folder);
}
