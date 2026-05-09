'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

const PRIMARY_DOMAIN =
  process.env.NEXT_PUBLIC_PRIMARY_DOMAIN || 'hirforyou.ro';
const SNIPPET = `<script src="https://${PRIMARY_DOMAIN}/embed.js"
  data-tenant="restaurantul-meu"
  data-color="#FF6B35"
  data-position="bottom-right"
  data-label="Comandă online"></script>`;

export function EmbedSnippetCopy() {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(SNIPPET);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for browsers without clipboard API permission — select text.
      const range = document.createRange();
      const pre = document.getElementById('hir-embed-snippet');
      if (pre) {
        range.selectNodeContents(pre);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
    }
  }

  return (
    <div className="relative">
      <pre
        id="hir-embed-snippet"
        className="overflow-x-auto rounded-xl bg-zinc-900 p-4 pr-14 text-xs leading-relaxed text-zinc-100"
      >
        {SNIPPET}
      </pre>
      <button
        type="button"
        onClick={handleCopy}
        aria-label="Copiază codul"
        className="absolute right-3 top-3 inline-flex h-9 items-center gap-1.5 rounded-full bg-white/10 px-3 text-xs font-medium text-zinc-100 backdrop-blur transition-colors hover:bg-white/20"
      >
        {copied ? (
          <>
            <Check className="h-3.5 w-3.5" /> Copiat
          </>
        ) : (
          <>
            <Copy className="h-3.5 w-3.5" /> Copiază
          </>
        )}
      </button>
    </div>
  );
}
