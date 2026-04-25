'use client';
import type { ReactNode } from 'react';
import { CartProvider } from '@/lib/cart/provider';
import { CartBootstrap } from './cart-bootstrap';

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
      {children}
    </CartProvider>
  );
}
