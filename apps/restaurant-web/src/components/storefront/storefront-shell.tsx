'use client';
import type { ReactNode } from 'react';
import { CartProvider } from '@/lib/cart/provider';
import { CartBootstrap } from './cart-bootstrap';
import { CartPrefillBootstrap } from './cart-prefill-bootstrap';

export function StorefrontShell({
  tenantId,
  children,
}: {
  tenantId: string;
  children: ReactNode;
}) {
  return (
    <CartProvider tenantId={tenantId}>
      <CartBootstrap tenantId={tenantId} />
      {/* Lane I (2026-05-04) — `?cart=<base64url>` deep-link hydrator. Order
          matters: cookie bootstrap (RSHIR-34 repeat-order) replaces the
          cart synchronously; this runs after and is additive, so a
          social-media link adds to whatever the customer already had. */}
      <CartPrefillBootstrap tenantId={tenantId} />
      {children}
    </CartProvider>
  );
}
