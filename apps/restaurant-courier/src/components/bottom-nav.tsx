'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, useReducedMotion } from 'framer-motion';
import { Map, History, Clock, Wallet, Settings } from 'lucide-react';

// Hepi removed from the nav per product decision (2026-06-02): low value /
// token-heavy; support handled by FAQ + fleet managers initially. The
// /dashboard/hepi route stays reachable (not deleted) so it can be re-promoted
// later if we decide to ship it.
//
// "Hartă" → /dashboard (the live map) is the FIRST tab: the map is the
// courier's home screen, but it was only reachable via the header logo or
// "Vezi harta" buttons — not intuitive. A dedicated tab makes returning to
// the map a single, always-visible tap (user feedback 2026-06-04).
// "Comenzi" removed (2026-06-07): the active order now lives on the map home
// screen (allocation pop-up → accept → in-order) — there's no separate order
// list to browse. Past orders stay reachable via "Istoric".
const NAV = [
  { href: '/dashboard', label: 'Hartă', Icon: Map },
  { href: '/dashboard/history', label: 'Istoric', Icon: History },
  { href: '/dashboard/shift', label: 'Tură', Icon: Clock },
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
export function BottomNav() {
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
          // `/dashboard` (map) needs EXACT matching: it's a prefix of every
          // route, so without it every tab would light up on sub-routes.
          const exactOnly = item.href === '/dashboard';
          const isActive = exactOnly
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
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
                <item.Icon
                  className="h-5 w-5"
                  aria-hidden
                  strokeWidth={isActive ? 2.5 : 2.25}
                />
                <span className={`whitespace-nowrap ${isActive ? 'font-semibold' : ''}`}>
                  {item.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
