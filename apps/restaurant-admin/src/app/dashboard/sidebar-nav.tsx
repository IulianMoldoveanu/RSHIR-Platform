'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@hir/ui';

export type SidebarItem = {
  href: string;
  label: string;
  showDot?: boolean;
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
    <nav className="flex flex-1 flex-col gap-1 p-2 text-sm">
      {items.map((item) => {
        const active = isActive(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex items-center justify-between rounded-md px-3 py-2 transition-colors border-l-2',
              active
                ? 'bg-zinc-100 text-zinc-900 border-purple-600 font-medium'
                : 'border-transparent text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900',
            )}
          >
            <span>{item.label}</span>
            {item.showDot && (
              <span
                aria-label="Configurare incompletă"
                className="h-2 w-2 rounded-full bg-amber-400"
              />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
