// Powered-by-HIR badge — v3 Loop 4 (passive viral discovery)
//
// Spec: apps/restaurant-admin/src/lib/partner-v3-spec.md
// Strategy: RSHIR-RESELLER-PROGRAM-V3-SNOWBALL-STRATEGY.md §3 Loop 4
//
// Default-on, opt-out via tenant settings (powered_by_hir_badge boolean).
// Renders a minimal footer line linking to /parteneriat with UTM tracking
// keyed to the tenant slug — lets us measure micro-site → discovery conversion.

import type { ReactElement } from 'react';

type Props = {
  tenantSlug: string;
  enabled: boolean;
  brandUrl?: string;
};

export function PoweredByHirBadge({ tenantSlug, enabled, brandUrl }: Props): ReactElement | null {
  if (!enabled) return null;

  const base = brandUrl?.replace(/\/$/, '') || 'https://hirforyou.ro';
  const href = `${base}/parteneriat?utm_source=poweredby&utm_medium=footer&utm_campaign=${encodeURIComponent(tenantSlug)}`;

  return (
    <div className="border-t border-zinc-100 bg-white py-2 text-center">
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className="text-[11px] font-medium tracking-wide text-zinc-400 transition-colors hover:text-zinc-700"
        aria-label="Aflați mai multe despre platforma HIR pentru restaurante"
      >
        Powered by HIR — restaurantul tău poate primi comisioane cât face Glovo
      </a>
    </div>
  );
}
