'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { PackageSearch } from 'lucide-react';
import { readLastOrder } from '@/lib/cart/last-order';
import { t, type Locale } from '@/lib/i18n';

// 2026-07-27 — a guest (no account) who leaves /track/<token> loses all
// access to that order: no account history, token not shown anywhere else.
// This reads the localStorage breadcrumb written at order-success time
// (see cart-cleanup-on-mount.tsx / CheckoutClient.tsx COD branch) and, if
// present and not expired, shows a small link back to it. Client-only
// (localStorage isn't available server-side) so it renders after mount —
// there's nothing to show on the very first paint, which is correct: a
// fresh visitor has no last order yet.
export function LastOrderBanner({ tenantId, locale }: { tenantId: string; locale: Locale }) {
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    setToken(readLastOrder(tenantId)?.token ?? null);
  }, [tenantId]);

  if (!token) return null;

  return (
    <div className="mx-4 mt-3 sm:mx-6">
      <Link
        href={`/track/${token}`}
        className="flex items-center gap-2.5 rounded-xl border border-purple-200 bg-purple-50 px-4 py-3 text-sm font-medium text-purple-900 transition-colors hover:bg-purple-100"
      >
        <PackageSearch className="h-4 w-4 shrink-0" aria-hidden />
        {t(locale, 'home.last_order_banner')}
      </Link>
    </div>
  );
}
