'use client';
import type { ReactNode } from 'react';
import { CartProvider } from '@/lib/cart/provider';

export function StorefrontShell({
  tenantId,
  children,
}: {
  tenantId: string;
  children: ReactNode;
}) {
  return <CartProvider tenantId={tenantId}>{children}</CartProvider>;
}
