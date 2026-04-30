'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BookOpen,
  ChevronDown,
  LayoutDashboard,
  type LucideIcon,
  Megaphone,
  Receipt,
  Rocket,
  Settings,
  Sliders,
  Sparkles,
  Users,
} from 'lucide-react';
import { cn } from '@hir/ui';

// Icons referenced by NAME (string) instead of function reference. Passing
// the function ref `Rocket` from a Server Component to this Client Component
// is what was crashing the dashboard — Next.js cannot serialize function
// values across the server/client boundary, throwing a generic digest-only
// error in production. We resolve the name back to the Lucide component
// on the client, which is safe.
const ICONS: Record<string, LucideIcon> = {
  rocket: Rocket,
  layoutDashboard: LayoutDashboard,
  receipt: Receipt,
  bookOpen: BookOpen,
  megaphone: Megaphone,
  sliders: Sliders,
  settings: Settings,
  sparkles: Sparkles,
  users: Users,
};

export type IconName = keyof typeof ICONS;

export type SidebarItem = {
  href: string;
  label: string;
  showDot?: boolean;
  icon?: IconName;
};

export type SidebarGroup = {
  label: string;
  icon?: IconName;
  items: SidebarItem[];
};

export type SidebarEntry = SidebarItem | SidebarGroup;

function isGroup(e: SidebarEntry): e is SidebarGroup {
  return 'items' in e;
}

export function SidebarNav({ entries }: { entries: SidebarEntry[] }) {
  const pathname = usePathname();

  function matches(href: string): boolean {
    if (pathname === href) return true;
    if (href === '/dashboard' || href === '/dashboard/settings') return false;
    return pathname.startsWith(href + '/');
  }

  return (
    <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2 text-sm">
      {entries.map((entry, idx) => {
        if (isGroup(entry)) {
          return (
            <SidebarGroupRow
              key={`g-${entry.label}-${idx}`}
              group={entry}
              matches={matches}
            />
          );
        }
        return <SidebarLeafRow key={entry.href} item={entry} active={matches(entry.href)} />;
      })}
    </nav>
  );
}

function SidebarGroupRow({
  group,
  matches,
}: {
  group: SidebarGroup;
  matches: (href: string) => boolean;
}) {
  const anyActive = group.items.some((i) => matches(i.href));
  const Icon = group.icon ? ICONS[group.icon] : undefined;
  return (
    <details className="group/sb" open={anyActive}>
      <summary
        className={cn(
          'flex cursor-pointer list-none items-center justify-between gap-2 rounded-md border-l-2 px-3 py-2 transition-colors',
          anyActive
            ? 'border-purple-600 bg-zinc-50 font-medium text-zinc-900'
            : 'border-transparent text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900',
        )}
      >
        <span className="flex min-w-0 items-center gap-2.5">
          {Icon ? (
            <Icon
              className={cn(
                'h-4 w-4 flex-none',
                anyActive ? 'text-purple-600' : 'text-zinc-400',
              )}
              aria-hidden
            />
          ) : null}
          <span className="truncate">{group.label}</span>
        </span>
        <ChevronDown
          className="h-3.5 w-3.5 flex-none text-zinc-400 transition-transform group-open/sb:rotate-180"
          aria-hidden
        />
      </summary>
      <ul className="mt-0.5 flex flex-col gap-0.5 pb-1 pl-7">
        {group.items.map((item) => (
          <SidebarLeafRow
            key={item.href}
            item={item}
            active={matches(item.href)}
            compact
          />
        ))}
      </ul>
    </details>
  );
}

function SidebarLeafRow({
  item,
  active,
  compact = false,
}: {
  item: SidebarItem;
  active: boolean;
  compact?: boolean;
}) {
  const Icon = item.icon ? ICONS[item.icon] : undefined;
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex items-center justify-between gap-2 rounded-md border-l-2 transition-colors',
        compact ? 'px-2.5 py-1.5 text-[13px]' : 'px-3 py-2',
        active
          ? 'border-purple-600 bg-zinc-100 font-medium text-zinc-900'
          : 'border-transparent text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900',
      )}
    >
      <span className="flex min-w-0 items-center gap-2.5">
        {Icon && !compact ? (
          <Icon
            className={cn(
              'h-4 w-4 flex-none',
              active ? 'text-purple-600' : 'text-zinc-400',
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
}
