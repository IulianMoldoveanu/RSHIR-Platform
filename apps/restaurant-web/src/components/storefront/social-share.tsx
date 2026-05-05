'use client';
import { useState } from 'react';
import { Check, Copy, Facebook, MessageCircle, Send, Share2, Twitter } from 'lucide-react';
import { appendUtm, type ShareChannel } from '@/lib/social/utm';

type SocialShareProps = {
  /** Canonical URL of the page being shared (no UTM — appended per channel). */
  url: string;
  /** Plain-text message used in WhatsApp / Twitter / Telegram prefill. */
  text: string;
  /** Tenant slug used as `utm_campaign`. */
  tenantSlug: string;
  /** Optional custom container className. */
  className?: string;
  /**
   * When true, renders a single "Share" button that triggers Web Share API
   * (mobile-native sheet); falls back to the inline channel grid if the
   * API isn't available. Default false (inline grid).
   */
  preferNative?: boolean;
  /** Localized labels — caller passes ro/en strings. */
  labels: {
    share: string;
    whatsapp: string;
    facebook: string;
    twitter: string;
    telegram: string;
    copy: string;
    copied: string;
  };
};

function whatsappHref(url: string, text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`;
}
function facebookHref(url: string): string {
  return `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
}
function twitterHref(url: string, text: string): string {
  return `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
}
function telegramHref(url: string, text: string): string {
  return `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
}

/**
 * Lane I (2026-05-04) — multi-channel share strip.
 *
 * No external SDKs; every share is a plain anchor (or Web Share API for
 * mobile). Each channel gets its own UTM source so storefront analytics
 * can attribute traffic. Copy-link uses the Clipboard API with a 2s
 * "copied" confirmation.
 */
export function SocialShare({
  url,
  text,
  tenantSlug,
  className,
  preferNative = false,
  labels,
}: SocialShareProps) {
  const [copied, setCopied] = useState(false);

  function urlFor(channel: ShareChannel): string {
    return appendUtm(url, channel, tenantSlug);
  }

  async function tryNative() {
    const nav = typeof navigator !== 'undefined' ? navigator : null;
    if (nav && typeof nav.share === 'function') {
      try {
        await nav.share({ title: text, text, url: urlFor('native') });
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }

  async function onNativeClick(e: React.MouseEvent) {
    e.preventDefault();
    await tryNative();
  }

  async function onCopy() {
    try {
      const link = urlFor('copy');
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(link);
      } else if (typeof document !== 'undefined') {
        const ta = document.createElement('textarea');
        ta.value = link;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }

  const containerClass =
    className ?? 'flex flex-wrap items-center gap-2';

  if (preferNative) {
    return (
      <div className={containerClass}>
        <button
          type="button"
          onClick={onNativeClick}
          className="inline-flex h-10 items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-4 text-sm font-medium text-zinc-700 shadow-sm transition-all hover:bg-zinc-50 active:scale-[0.98] motion-reduce:active:scale-100"
        >
          <Share2 className="h-4 w-4" />
          {labels.share}
        </button>
      </div>
    );
  }

  return (
    <div className={containerClass} role="group" aria-label={labels.share}>
      <a
        href={whatsappHref(urlFor('whatsapp'), text)}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={labels.whatsapp}
        title={labels.whatsapp}
        className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700 shadow-sm transition-all hover:bg-emerald-100 active:scale-[0.94] motion-reduce:active:scale-100"
      >
        <MessageCircle className="h-4 w-4" />
      </a>
      <a
        href={facebookHref(urlFor('facebook'))}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={labels.facebook}
        title={labels.facebook}
        className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-blue-200 bg-blue-50 text-blue-700 shadow-sm transition-all hover:bg-blue-100 active:scale-[0.94] motion-reduce:active:scale-100"
      >
        <Facebook className="h-4 w-4" />
      </a>
      <a
        href={twitterHref(urlFor('twitter'), text)}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={labels.twitter}
        title={labels.twitter}
        className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-800 shadow-sm transition-all hover:bg-zinc-50 active:scale-[0.94] motion-reduce:active:scale-100"
      >
        <Twitter className="h-4 w-4" />
      </a>
      <a
        href={telegramHref(urlFor('telegram'), text)}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={labels.telegram}
        title={labels.telegram}
        className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-sky-200 bg-sky-50 text-sky-700 shadow-sm transition-all hover:bg-sky-100 active:scale-[0.94] motion-reduce:active:scale-100"
      >
        <Send className="h-4 w-4" />
      </a>
      <button
        type="button"
        onClick={onCopy}
        aria-label={copied ? labels.copied : labels.copy}
        title={copied ? labels.copied : labels.copy}
        className="inline-flex h-10 items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-700 shadow-sm transition-all hover:bg-zinc-50 active:scale-[0.98] motion-reduce:active:scale-100"
      >
        {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
        <span className="hidden sm:inline">{copied ? labels.copied : labels.copy}</span>
      </button>
    </div>
  );
}
