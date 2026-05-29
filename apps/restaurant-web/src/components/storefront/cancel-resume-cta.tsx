'use client';

// P0 audit #12 — resume CTA on /checkout/cancel. Click flow:
//   1. POST /api/checkout/cancel-resume with the orderId (server marks the
//      PENDING row CANCELLED atomically).
//   2. Check sessionStorage for the cart — if still there, push to '/'.
//   3. Otherwise show the cart_lost toast and push '/' anyway so the
//      customer rebuilds from menu instead of being stuck.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { CART_STORAGE_KEY } from '@/app/checkout/useCart';

export function CancelResumeCta({
  orderId,
  resumeLabel,
  cartLostMessage,
}: {
  orderId: string;
  resumeLabel: string;
  cartLostMessage: string;
}) {
  const router = useRouter();
  const [working, setWorking] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  async function handleResume() {
    if (working) return;
    setWorking(true);
    setToast(null);
    try {
      // Best-effort cancel. We push to '/' even if the request fails — the
      // customer should not be stuck on the cancel page because a backend
      // error blocks the resume CTA. The PENDING row will get cleaned up
      // by ops eventually.
      await fetch('/api/checkout/cancel-resume', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ orderId }),
      }).catch(() => null);

      let cartIntact = false;
      try {
        const raw = sessionStorage.getItem(CART_STORAGE_KEY);
        cartIntact = !!raw && raw !== 'null' && raw !== '[]';
      } catch {
        cartIntact = false;
      }
      if (!cartIntact) {
        setToast(cartLostMessage);
        // Brief delay so the toast is visible before the navigation.
        setTimeout(() => router.push('/'), 1200);
        return;
      }
      router.push('/');
    } finally {
      setWorking(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void handleResume()}
        disabled={working}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-purple-700 px-4 text-base font-semibold text-white shadow-md shadow-purple-700/30 transition-all hover:-translate-y-px hover:bg-purple-800 disabled:opacity-60"
      >
        {resumeLabel}
        <ChevronRight className="h-4 w-4" aria-hidden />
      </button>
      {toast && (
        <p
          role="status"
          className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900"
        >
          {toast}
        </p>
      )}
    </>
  );
}
