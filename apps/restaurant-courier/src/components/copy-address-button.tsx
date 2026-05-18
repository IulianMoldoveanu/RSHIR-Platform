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
      className={`inline-flex min-h-[36px] items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-semibold transition-all hover:-translate-y-px active:translate-y-0 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 ${
        copied
          ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200 focus-visible:outline-emerald-500'
          : 'border-hir-border bg-hir-surface text-hir-fg hover:border-violet-500/40 hover:bg-hir-border/60 focus-visible:outline-violet-500'
      }`}
    >
      {copied ? (
        <>
          <Check className="h-3 w-3 text-emerald-300" aria-hidden strokeWidth={3} />
          Copiat
        </>
      ) : (
        <>
          <Copy className="h-3 w-3 text-hir-muted-fg" aria-hidden strokeWidth={2.25} />
          Copiază
        </>
      )}
    </button>
  );
}
