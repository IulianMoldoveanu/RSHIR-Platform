'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Menu } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@hir/ui';
import { SidebarNav, type SidebarEntry } from './sidebar-nav';

// §6 P2 — Mobile sidebar. Hidden on lg+ where the static <aside> is shown.
// On <lg the dashboard top-bar gets a hamburger button that opens a left
// Sheet containing the same SidebarNav. Auto-closes on route change so
// the user doesn't have to manually dismiss after picking a destination.

export function MobileSidebar({ entries }: { entries: SidebarEntry[] }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <>
      {/* Mobile-fix 2026-05-05: bump the trigger from 36×36 to 44×44 so it
          clears the WCAG 2.5.5 / Apple HIG 44 px minimum tap target.
          Same icon size to keep the visual weight in the topbar. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Deschide meniul"
        className="lg:hidden inline-flex h-11 w-11 items-center justify-center rounded-md border border-zinc-200 bg-white text-zinc-700 transition-colors hover:bg-zinc-50"
      >
        <Menu className="h-5 w-5" />
      </button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="left"
          className="flex w-72 flex-col gap-0 p-0 sm:max-w-xs"
        >
          <SheetHeader className="border-b border-zinc-200 px-4 py-3">
            <SheetTitle className="flex items-center gap-2 text-sm font-semibold tracking-tight text-zinc-900">
              <span
                aria-hidden
                className="flex h-7 w-7 items-center justify-center rounded-md bg-purple-600 text-xs font-bold text-white"
              >
                H
              </span>
              HIR
            </SheetTitle>
          </SheetHeader>
          <SidebarNav entries={entries} />
        </SheetContent>
      </Sheet>
    </>
  );
}
