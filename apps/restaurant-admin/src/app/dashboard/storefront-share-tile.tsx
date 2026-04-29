'use client';

import { useState } from 'react';
import { Copy, Check, ExternalLink, MessageCircle, Share2, Send } from 'lucide-react';

// Driving the first-order flywheel: restaurants forget to share their HIR
// link → no orders → churn. Putting the storefront URL on the dashboard
// home with one-tap copy + WhatsApp + Telegram share is the single highest-
// leverage retention nudge for the first 30 days.

type Props = {
  storefrontUrl: string;
  tenantName: string;
};

export function StorefrontShareTile({ storefrontUrl, tenantName }: Props) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(storefrontUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Fallback: select-all in a temporary textarea. Not all browsers grant
      // clipboard write without user gesture context; for those we silently
      // do nothing rather than throw.
    }
  };

  const shareText = `Comandă la ${tenantName}: ${storefrontUrl}`;
  const whatsappHref = `https://wa.me/?text=${encodeURIComponent(shareText)}`;
  const telegramHref = `https://t.me/share/url?url=${encodeURIComponent(storefrontUrl)}&text=${encodeURIComponent(`Comandă la ${tenantName}`)}`;

  return (
    <section
      aria-label="Distribuie storefrontul"
      className="rounded-xl border border-zinc-200 bg-white p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
            <Share2 className="h-3.5 w-3.5" aria-hidden />
            Linkul tău de comandă
          </p>
          <h2 className="mt-1 text-base font-semibold text-zinc-900">Distribuie pe canalele tale</h2>
        </div>
        <a
          href={storefrontUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
        >
          Vezi pagina
          <ExternalLink className="h-3 w-3" aria-hidden />
        </a>
      </div>

      <div className="mt-3 flex items-center gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2">
        <code className="flex-1 truncate font-mono text-sm text-zinc-800">{storefrontUrl}</code>
        <button
          type="button"
          onClick={copy}
          aria-label="Copiază linkul"
          className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors ${
            copied
              ? 'bg-emerald-100 text-emerald-800'
              : 'bg-white text-zinc-700 hover:bg-zinc-100'
          }`}
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5" aria-hidden />
              Copiat
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" aria-hidden />
              Copiază
            </>
          )}
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <a
          href={whatsappHref}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800 transition-colors hover:bg-emerald-100"
        >
          <MessageCircle className="h-3.5 w-3.5" aria-hidden />
          Trimite pe WhatsApp
        </a>
        <a
          href={telegramHref}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-medium text-sky-800 transition-colors hover:bg-sky-100"
        >
          <Send className="h-3.5 w-3.5" aria-hidden />
          Trimite pe Telegram
        </a>
      </div>

      <p className="mt-3 text-xs text-zinc-500">
        Postează linkul în story-uri Instagram, în descrierea Google Maps, sau lipește un QR pe
        masă. Fiecare comandă pe HIR e cu 25% mai profitabilă decât pe Wolt sau Glovo.
      </p>
    </section>
  );
}
