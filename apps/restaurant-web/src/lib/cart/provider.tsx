'use client';
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { getCartStore, type CartStore } from './store';

const CartContext = createContext<CartStore | null>(null);

export function CartProvider({ tenantId, children }: { tenantId: string; children: ReactNode }) {
  const store = useMemo(() => getCartStore(tenantId), [tenantId]);
  return <CartContext.Provider value={store}>{children}</CartContext.Provider>;
}

export function useCart() {
  const store = useContext(CartContext);
  if (!store) {
    throw new Error('useCart must be used inside <CartProvider>');
  }
  return store;
}
