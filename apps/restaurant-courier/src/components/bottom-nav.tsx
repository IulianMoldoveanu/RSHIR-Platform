'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, useReducedMotion } from 'framer-motion';
import { Package, Clock, MessageSquare, Wallet, Settings } from 'lucide-react';

const NAV = [
  { href: '/dashboard/orders', label: 'Comenzi', Icon: Package },
  { href: '/dashboard/shift', label: 'Tură', Icon: Clock },
  { href: '/dashboard/messages', label: 'Mesaje', Icon: MessageSquare },
  { href: '/dashboard/earnings', label: 'Câștiguri', Icon: Wallet },
  { href: '/dashboard/settings', label: 'Setări', Icon: Settings },
] as const;

// Bottom-nav with active-tab indicator. Highlights the icon + label of the
// current route in violet and slides a 2px violet bar across the top of
// the active item using framer-motion's shared `layoutId` so the bar
// glides between tabs rather than snapping. Reduced-motion users get an
// instant move.
//
// Tap targets stay at the full ~64×56 cell size; the focus ring + scale-95
// active state give tactile feedback. `aria-current="page"` on the active
// link announces the position for screen readers.
export function BottomNav({ ordersBadge }: { ordersBadge: number }) {
  const pathname = usePathname() ?? '';
  const reduce = useReducedMotion();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-[1100] border-t border-hir-border bg-hir-bg/95 backdrop-blur"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      aria-label="Navigație principală"
    >
      <ul className="mx-auto flex max-w-xl items-stretch justify-around">
        {NAV.map((item) => {
          const isActive =
            item.href === '/dashboard/orders'
              ? pathname === item.href
              : pathname === item.href || pathname.startsWith(`${item.href}/`);
          const badgeCount =
            item.href === '/dashboard/orders' && ordersBadge > 0 ? ordersBadge : 0;
          return (
            <li key={item.href} className="relative flex-1">
              <Link
                href={item.href}
                aria-current={isActive ? 'page' : undefined}
                className={`relative flex flex-col items-center gap-0.5 px-2 py-3 text-[11px] font-medium transition-colors active:scale-95 focus-visible:outline-2 focus-visible:outline-violet-500 focus-visible:outline-offset-[-2px] focus-visible:rounded-lg ${
                  isActive
                    ? 'text-violet-300'
                    : 'text-hir-muted-fg hover:text-violet-400'
                }`}
              >
                {isActive ? (
                  reduce ? (
                    <span
                      aria-hidden
                      className="absolute inset-x-4 top-0 h-[2px] rounded-full bg-violet-500"
                    />
                  ) : (
                    <motion.span
                      aria-hidden
                      layoutId="bottom-nav-indicator"
                      className="absolute inset-x-4 top-0 h-[2px] rounded-full bg-violet-500"
                      transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                    />
                  )
                ) : null}
                <span className="relative">
                  <item.Icon className="h-5 w-5" aria-hidden />
                  {badgeCount > 0 ? (
                    <span
                      className="absolute -right-2 -top-1 flex min-w-[16px] items-center justify-center rounded-full bg-violet-500 px-1 text-[9px] font-bold text-white"
                      aria-label={`${badgeCount} comenzi disponibile`}
                    >
                      {badgeCount > 9 ? '9+' : badgeCount}
                    </span>
                  ) : null}
                </span>
                <span>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
