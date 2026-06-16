'use client';

// Mobile bottom-nav for the partner portal.
// Renders on small screens only (md:hidden). Uses the route segment to
// highlight the active entry. Sticky at viewport bottom with safe-area
// padding so it clears the iOS home indicator.

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Inbox,
  Calculator,
  Wallet,
  Settings2,
} from 'lucide-react';
import type { ReactNode } from 'react';

type Entry = {
  href: string;
  label: string;
  icon: ReactNode;
  /** Match either an exact href or a path that startsWith one of these. */
  match: (path: string) => boolean;
};

const ENTRIES: Entry[] = [
  {
    href: '/partner-portal',
    label: 'Acasă',
    icon: <LayoutDashboard className="h-5 w-5" aria-hidden />,
    match: (p) => p === '/partner-portal',
  },
  {
    href: '/partner-portal/leads',
    label: 'Lead-uri',
    icon: <Inbox className="h-5 w-5" aria-hidden />,
    match: (p) => p.startsWith('/partner-portal/leads'),
  },
  {
    href: '/partner-portal/calculator',
    label: 'Calculator',
    icon: <Calculator className="h-5 w-5" aria-hidden />,
    match: (p) => p.startsWith('/partner-portal/calculator'),
  },
  {
    href: '/partner-portal/commissions',
    label: 'Bani',
    icon: <Wallet className="h-5 w-5" aria-hidden />,
    match: (p) => p.startsWith('/partner-portal/commissions'),
  },
  {
    href: '/partner-portal/team',
    label: 'Echipa',
    icon: <Settings2 className="h-5 w-5" aria-hidden />,
    match: (p) => p.startsWith('/partner-portal/team'),
  },
];

export function BottomNav() {
  const pathname = usePathname() ?? '/partner-portal';
  return (
    <nav
      aria-label="Navigație principală (mobil)"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-zinc-200 bg-white/95 backdrop-blur lg:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className="grid grid-cols-5">
        {ENTRIES.map((e) => {
          const active = e.match(pathname);
          return (
            <li key={e.href}>
              <Link
                href={e.href}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-[56px] flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-[10px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-inset ${
                  active
                    ? 'text-purple-700'
                    : 'text-zinc-500 hover:text-zinc-800'
                }`}
              >
                <span
                  className={`${
                    active ? 'scale-110' : 'scale-100'
                  } transition-transform`}
                >
                  {e.icon}
                </span>
                <span>{e.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
