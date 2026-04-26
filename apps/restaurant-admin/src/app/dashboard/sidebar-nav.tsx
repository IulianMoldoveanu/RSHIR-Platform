'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@hir/ui';

export type SidebarItem = {
  href: string;
  label: string;
  showDot?: boolean;
  icon?: LucideIcon;
};

export function SidebarNav({ items }: { items: SidebarItem[] }) {
  const pathname = usePathname();

  function isActive(href: string): boolean {
    if (pathname === href) return true;
    // /dashboard/settings is the bare settings root; only match exactly so
    // the longer /dashboard/settings/branding etc. don't both light up.
    if (href === '/dashboard' || href === '/dashboard/settings') return false;
    return pathname.startsWith(href + '/') || pathname === href;
  }

  return (
    <nav className="flex flex-1 flex-col gap-0.5 p-2 text-sm">
      {items.map((item) => {
        const active = isActive(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex items-center justify-between gap-2 rounded-md border-l-2 px-3 py-2 transition-colors',
              active
                ? 'border-purple-600 bg-zinc-100 font-medium text-zinc-900'
                : 'border-transparent text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900',
            )}
          >
            <span className="flex min-w-0 items-center gap-2.5">
              {Icon ? (
                <Icon
                  className={cn(
                    'h-4 w-4 flex-none',
                    active ? 'text-purple-600' : 'text-zinc-400 group-hover:text-zinc-700',
                  )}
                  aria-hidden
                />
              ) : null}
              <span className="truncate">{item.label}</span>
            </span>
            {item.showDot && (
              <span
                aria-label="Configurare incompletă"
                className="h-2 w-2 flex-none rounded-full bg-amber-400"
              />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
