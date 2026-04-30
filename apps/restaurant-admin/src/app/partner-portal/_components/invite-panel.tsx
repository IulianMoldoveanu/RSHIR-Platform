'use client';

import { useState } from 'react';

export function InvitePanel({ referralUrl }: { referralUrl: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(referralUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: select the input text
      const el = document.getElementById('referral-url-input') as HTMLInputElement | null;
      el?.select();
    }
  }

  const waText = encodeURIComponent(
    `Înregistrează-ți restaurantul pe HIR gratuit: ${referralUrl}`,
  );
  const tgText = encodeURIComponent(
    `Înregistrează-ți restaurantul pe HIR: ${referralUrl}`,
  );

  return (
    <section
      aria-label="Linkul tău de invitație"
      className="rounded-lg border border-purple-200 bg-purple-50 p-4"
    >
      <h2 className="mb-1 text-sm font-semibold text-purple-900">
        Linkul tău de invitație
      </h2>
      <p className="mb-3 text-xs text-purple-700">
        Trimite acest link restaurantelor pe care le recrutezi. Comisionul tău va fi
        înregistrat automat după activarea contului.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          id="referral-url-input"
          readOnly
          value={referralUrl}
          className="flex-1 rounded-md border border-purple-300 bg-white px-3 py-2 text-sm font-mono text-zinc-700 focus:outline-none focus:ring-2 focus:ring-purple-500"
          aria-label="URL referral unic"
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleCopy}
            aria-label="Copiază linkul de invitație"
            className="rounded-md border border-purple-300 bg-white px-3 py-2 text-xs font-medium text-purple-700 transition-colors hover:bg-purple-100"
          >
            {copied ? 'Copiat!' : 'Copiază'}
          </button>
          <a
            href={`https://wa.me/?text=${waText}`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Distribuie pe WhatsApp"
            className="rounded-md bg-emerald-600 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-emerald-700"
          >
            WhatsApp
          </a>
          <a
            href={`https://t.me/share/url?url=${encodeURIComponent(referralUrl)}&text=${tgText}`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Distribuie pe Telegram"
            className="rounded-md bg-sky-500 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-sky-600"
          >
            Telegram
          </a>
        </div>
      </div>
    </section>
  );
}
