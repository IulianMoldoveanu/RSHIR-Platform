'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

// Tap-to-copy address chip used on pickup/dropoff cards. Some riders
// paste the address into Waze / Glovo / their own nav app — saving a
// long-press selection beats typing it manually on a parked scooter.
export function CopyAddressButton({ address }: { address: string | null | undefined }) {
  const [copied, setCopied] = useState(false);

  if (!address) return null;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(address as string);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Some browsers / iframes block clipboard without user gesture
      // even on click — silently fail; the rider can still long-press
      // the address text and use the OS picker.
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={copied ? 'Adresă copiată' : 'Copiază adresa'}
      className="inline-flex items-center gap-1 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-[11px] font-medium text-zinc-300 hover:bg-zinc-800 active:scale-95"
    >
      {copied ? (
        <>
          <Check className="h-3 w-3 text-emerald-400" aria-hidden />
          Copiat
        </>
      ) : (
        <>
          <Copy className="h-3 w-3" aria-hidden />
          Copiază
        </>
      )}
    </button>
  );
}
