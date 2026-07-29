'use client';

import Link from 'next/link';
import { ShoppingCart } from 'lucide-react';
import { useDemoCartStore } from '@/lib/demo/demo-cart-store';

export function DemoCartBar({ tenantName }: { tenantName: string }) {
  const count = useDemoCartStore((s) => s.getCount());
  const subtotal = useDemoCartStore((s) => s.getSubtotal());

  if (count === 0) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-zinc-200 bg-white p-3">
      <Link
        href="/demo-storefront/checkout"
        className="mx-auto flex max-w-2xl items-center justify-between rounded-xl bg-[var(--hir-brand)] px-4 py-3 text-white"
      >
        <span className="flex items-center gap-2 text-sm font-semibold">
          <ShoppingCart className="h-4 w-4" aria-hidden />
          {count} {count === 1 ? 'produs' : 'produse'} · {tenantName}
        </span>
        <span className="text-sm font-bold">{subtotal.toFixed(2)} lei</span>
      </Link>
    </div>
  );
}
