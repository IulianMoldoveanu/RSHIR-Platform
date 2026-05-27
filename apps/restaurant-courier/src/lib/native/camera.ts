'use client';

/**
 * Unified camera bridge for proof-of-delivery photos.
 *
 * Native (Capacitor): uses @capacitor/camera with native camera UI.
 * Browser / PWA: uses the HTML <input type="file" capture="environment"> pattern
 * via a hidden file input — works on both Android Chrome and iOS Safari.
 *
 * Output: a Blob ready to upload to Supabase storage `delivery-proofs/` bucket.
 * Images are compressed to ≤80% JPEG quality and ≤2048px on the longest side.
 */

import { Capacitor } from '@capacitor/core';

export type PhotoResult =
  | { status: 'captured'; blob: Blob; mimeType: 'image/jpeg' }
  | { status: 'cancelled' }
  | { status: 'denied' }
  | { status: 'error'; message: string };

const MAX_PX = 2048;
const JPEG_QUALITY = 0.8;

/** Resize + re-encode a Blob to JPEG at the given max dimension. */
async function resizeToJpeg(input: Blob): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(input);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > MAX_PX || height > MAX_PX) {
        if (width >= height) {
          height = Math.round((height / width) * MAX_PX);
          width = MAX_PX;
        } else {
          width = Math.round((width / height) * MAX_PX);
          height = MAX_PX;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('canvas 2d context unavailable')); return; }
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (!blob) { reject(new Error('canvas.toBlob failed')); return; }
          resolve(blob);
        },
        'image/jpeg',
        JPEG_QUALITY,
      );
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image load failed')); };
    img.src = url;
  });
}

/**
 * Open the camera and return a compressed JPEG Blob.
 *
 * On Android (native): opens the native camera via Capacitor Camera plugin.
 * On browser / iOS PWA: triggers a file input with capture="environment".
 */
export async function takePhoto(): Promise<PhotoResult> {
  // ── Native path (Capacitor Camera) ──────────────────────────────────────
  if (Capacitor.isNativePlatform()) {
    try {
      const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera');
      const perm = await Camera.requestPermissions({ permissions: ['camera'] });
      if (perm.camera !== 'granted') return { status: 'denied' };

      const photo = await Camera.getPhoto({
        resultType: CameraResultType.Base64,
        source: CameraSource.Camera,
        quality: 80,
        width: MAX_PX,
        correctOrientation: true,
      });

      if (!photo.base64String) return { status: 'cancelled' };

      const byteChars = atob(photo.base64String);
      const byteNums = new Uint8Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) {
        byteNums[i] = byteChars.charCodeAt(i);
      }
      const blob = new Blob([byteNums], { type: 'image/jpeg' });

      return { status: 'captured', blob, mimeType: 'image/jpeg' };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.toLowerCase().includes('cancel') || msg.toLowerCase().includes('dismissed')) {
        return { status: 'cancelled' };
      }
      return { status: 'error', message: msg };
    }
  }

  // ── Browser / PWA path (file input with capture) ────────────────────────
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment';
    input.style.display = 'none';

    input.onchange = async () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) { resolve({ status: 'cancelled' }); return; }
      try {
        const compressed = await resizeToJpeg(file);
        resolve({ status: 'captured', blob: compressed, mimeType: 'image/jpeg' });
      } catch (e) {
        resolve({ status: 'error', message: e instanceof Error ? e.message : String(e) });
      }
    };

    input.oncancel = () => { input.remove(); resolve({ status: 'cancelled' }); };

    document.body.appendChild(input);
    input.click();
  });
}
