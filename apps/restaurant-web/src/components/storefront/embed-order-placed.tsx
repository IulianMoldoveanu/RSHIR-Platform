'use client';

import { useEffect } from 'react';

/**
 * Lane Y5 (2026-05-05) — fires `parent.postMessage({type:'hir:order_placed',...})`
 * once on mount when the page is rendered inside an embed iframe. Mounted
 * by the checkout success page (CARD path lands here) and by the COD
 * branch right before it routes the customer to /track.
 *
 * Origin is set to '*' because the parent's origin is the merchant's
 * own site, which we don't know server-side. The merchant snippet on
 * the parent does its own `event.origin === ORIGIN` check to ignore
 * messages from anything other than the HIR origin (see embed.js).
 */
export function EmbedOrderPlaced({
  orderId,
  total,
}: {
  orderId: string | null;
  total: number | null;
}) {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.parent === window) return; // not in iframe
    try {
      window.parent.postMessage(
        {
          type: 'hir:order_placed',
          orderId: orderId || null,
          total: typeof total === 'number' ? total : null,
          ts: Date.now(),
        },
        '*',
      );
    } catch {
      // postMessage failures are not actionable client-side; the host page
      // analytics simply won't get the event for this order.
    }
  }, [orderId, total]);

  return null;
}
