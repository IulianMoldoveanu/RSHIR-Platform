'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

type Props = {
  text: string;
};

export function CopyButton({ text }: Props) {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      // 1.6s feedback window — long enough to read, short enough to feel
      // responsive on a second click.
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Older Safari without clipboard permission — silently no-op.
      // Page still renders the text, the user can select-and-copy.
    }
  };

  return (
    <button
      type="button"
      onClick={onCopy}
      className="inline-flex items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-[12px] font-medium text-zinc-900 hover:bg-zinc-50"
    >
      {copied ? (
        <>
          <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden />
          Copiat
        </>
      ) : (
        <>
          <Copy className="h-3.5 w-3.5" aria-hidden />
          Copiază textul
        </>
      )}
    </button>
  );
}
