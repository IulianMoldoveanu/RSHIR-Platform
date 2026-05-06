// Lane EMBED-ADMIN-LINK (2026-05-06) — admin-side copy of the embed snippet
// widget. We keep a separate copy (instead of cross-importing from
// `restaurant-web`) because the two apps don't share a workspace import
// boundary and the snippet is a 60-line file.
//
// Difference from the public version: the tenant slug is pre-filled from
// the active tenant so the owner can copy → paste with zero edits. The
// `data-color` defaults to the brand color from settings if available.

'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

type Props = {
  tenantSlug: string;
  scriptOrigin: string;
  brandColor?: string | null;
};

export function EmbedSnippetCopy({ tenantSlug, scriptOrigin, brandColor }: Props) {
  const [copied, setCopied] = useState(false);

  const color = brandColor && /^#[0-9a-fA-F]{6}$/.test(brandColor) ? brandColor : '#FF6B35';
  const snippet = `<script src="${scriptOrigin}/embed.js"
  data-tenant="${tenantSlug}"
  data-color="${color}"
  data-position="bottom-right"
  data-label="Comandă online"></script>`;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback when clipboard API is blocked — select the <pre> contents
      // so the user can manually copy with Ctrl+C.
      const range = document.createRange();
      const pre = document.getElementById('hir-embed-snippet-admin');
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
        id="hir-embed-snippet-admin"
        className="overflow-x-auto rounded-lg bg-zinc-900 p-4 pr-14 text-xs leading-relaxed text-zinc-100"
      >
        {snippet}
      </pre>
      <button
        type="button"
        onClick={handleCopy}
        aria-label="Copiază codul"
        className="absolute right-3 top-3 inline-flex h-8 items-center gap-1.5 rounded-full bg-white/10 px-3 text-xs font-medium text-zinc-100 backdrop-blur transition-colors hover:bg-white/20"
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
