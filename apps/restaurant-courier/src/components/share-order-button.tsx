'use client';

import { useState } from 'react';
import { Share2 } from 'lucide-react';
import { Button, toast } from '@hir/ui';

type Props = {
  orderShortId: string;
  customerFirstName: string | null;
  dropoffAddress: string | null;
  /** Live ETA pulled by the parent component, in minutes. Optional. */
  etaMinutes?: number | null;
};

/**
 * Web-Share button on the order detail page. Lets the courier share a
 * one-line update with the customer (or a fellow courier) via the OS's
 * native share sheet: WhatsApp, SMS, email, etc.
 *
 * Falls back to clipboard copy when navigator.share is unavailable
 * (desktop browsers, some Android WebViews).
 *
 * The shared text is intentionally short and brand-neutral — couriers
 * use this in the field and it must read well outside the app.
 */
export function ShareOrderButton({
  orderShortId,
  customerFirstName,
  dropoffAddress,
  etaMinutes,
}: Props) {
  const [busy, setBusy] = useState(false);

  function buildMessage(): string {
    const greeting = customerFirstName ? `Bună, ${customerFirstName}!` : 'Bună!';
    const etaLine =
      typeof etaMinutes === 'number' && etaMinutes > 0
        ? `Ajung la tine în aproximativ ${etaMinutes} minute.`
        : 'Sunt în drum spre tine.';
    const addressLine = dropoffAddress ? `Adresă: ${dropoffAddress}` : '';
    return [greeting, etaLine, addressLine, `Comanda #${orderShortId}.`]
      .filter(Boolean)
      .join(' ');
  }

  async function onShare() {
    const message = buildMessage();
    setBusy(true);
    try {
      // Prefer the native share sheet — feels right on mobile.
      if (
        typeof navigator !== 'undefined' &&
        typeof navigator.share === 'function'
      ) {
        await navigator.share({
          title: 'Statusul comenzii — HIR Curier',
          text: message,
        });
        return;
      }

      // Clipboard fallback (most desktop browsers).
      if (
        typeof navigator !== 'undefined' &&
        navigator.clipboard &&
        typeof navigator.clipboard.writeText === 'function'
      ) {
        await navigator.clipboard.writeText(message);
        toast.success('Mesaj copiat în clipboard.', { duration: 3_000 });
        return;
      }

      toast('Funcția de partajare nu e disponibilă pe acest dispozitiv.', {
        duration: 4_000,
      });
    } catch (err) {
      // AbortError is fired when the user dismisses the share sheet — not
      // a real failure, don't toast.
      if (err instanceof Error && err.name === 'AbortError') return;
      toast('Partajarea a eșuat. Încearcă din nou.', { duration: 4_000 });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={onShare}
      disabled={busy}
      className="self-start"
    >
      <Share2 className="mr-2 h-4 w-4" aria-hidden />
      {busy ? 'Se pregătește…' : 'Partajează statusul'}
    </Button>
  );
}
