'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BookOpen,
  ChevronDown,
  HelpCircle,
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
  helpCircle: HelpCircle,
};

export type IconName = keyof typeof ICONS;

export type SidebarItem = {
  href: string;
  label: string;
  showDot?: boolean;
  icon?: IconName;
};

// QW3 (UIUX audit 2026-05-08): SidebarGroup now supports a single level of
// nested sub-groups so Configurare can split its 14 leaves into 4 themed
// buckets (Identitate / Operațiuni / Contabilitate / Integrări) without
// flattening the navigation. Mixed children are allowed — sub-groups +
// leaves at the same level — to keep flexibility for future surfaces.
export type SidebarSubGroup = {
  label: string;
  items: SidebarItem[];
};

export type SidebarGroup = {
  label: string;
  icon?: IconName;
  items: Array<SidebarItem | SidebarSubGroup>;
};

export type SidebarEntry = SidebarItem | SidebarGroup;

function isGroup(e: SidebarEntry): e is SidebarGroup {
  return 'items' in e;
}

function isSubGroup(e: SidebarItem | SidebarSubGroup): e is SidebarSubGroup {
  return 'items' in e;
}

function flattenGroupHrefs(items: Array<SidebarItem | SidebarSubGroup>): string[] {
  const out: string[] = [];
  for (const i of items) {
    if (isSubGroup(i)) out.push(...i.items.map((x) => x.href));
    else out.push(i.href);
  }
  return out;
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
  const allHrefs = flattenGroupHrefs(group.items);
  const anyActive = allHrefs.some((href) => matches(href));
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
        {group.items.map((entry, idx) => {
          if (isSubGroup(entry)) {
            return (
              <SidebarSubGroupRow
                key={`sg-${entry.label}-${idx}`}
                subGroup={entry}
                matches={matches}
              />
            );
          }
          return (
            <SidebarLeafRow
              key={entry.href}
              item={entry}
              active={matches(entry.href)}
              compact
            />
          );
        })}
      </ul>
    </details>
  );
}

// QW3 — second-level group inside a top-level group. Renders as a small
// uppercase header with its own list of leaves below; no chevron, no
// collapse (the parent group already collapses everything together).
function SidebarSubGroupRow({
  subGroup,
  matches,
}: {
  subGroup: SidebarSubGroup;
  matches: (href: string) => boolean;
}) {
  return (
    <li className="flex flex-col gap-0.5 pt-1.5 first:pt-0">
      <p className="px-2 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
        {subGroup.label}
      </p>
      <ul className="flex flex-col gap-0.5">
        {subGroup.items.map((item) => (
          <SidebarLeafRow
            key={item.href}
            item={item}
            active={matches(item.href)}
            compact
          />
        ))}
      </ul>
    </li>
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
